import asyncio
import importlib.util
from pathlib import Path

from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('a10server', ROOT / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def test_default_seat_numbering_v1():
    m = server.default_layout()["seat_map"]
    assert m[0] == [None,None,22,30,38,None]
    assert m[-1] == [1,8,15,23,31,39]
    assert server.valid_seats(server.default_layout()) == set(range(1,46))


def test_session_create_join_recover_and_end(tmp_path, monkeypatch):
    async def scenario():
        monkeypatch.setattr(server, 'STATE_FILE', tmp_path / 'state.json')
        server.CLASSES.clear(); server.SESSIONS.clear(); server.TEACHER_WS.clear(); server.STUDENT_WS.clear()
        client=TestClient(TestServer(server.create_app())); await client.start_server()
        try:
            r=await client.post('/api/classes',json={'title':'音声学'}); c=await r.json()
            r=await client.post(f'/api/class/{c["class_code"]}/session',json={}); created=await r.json(); sid=created['session_id']
            r=await client.post(f'/api/session/{sid}/join',json={'student_id':'A001','surname':'サトウ','given_name':'ハナコ','seat_no':1}); assert r.status==200; p1=await r.json()
            r=await client.post(f'/api/session/{sid}/join',json={'student_id':'A002','surname':'スズキ','given_name':'タロウ','seat_no':1}); assert r.status==200
            pub=await (await client.get(f'/api/session/{sid}/public')).json(); assert 'participants' not in pub and 'A001' not in str(pub)
            r=await client.post(f'/api/session/{sid}/join',json={'student_id':'A003','surname':'タナカ','given_name':'ケン','seat_no':46}); assert r.status==400
            r=await client.post('/api/recover',json={'recovery_code':created['recovery_code']}); assert r.status==200; recovered=await r.json(); assert recovered['session_id']==sid
            r=await client.post(f'/api/session/{sid}/end',json={'teacher_token':created['teacher_token']}); assert r.status==200
            assert (await client.get(f'/api/session/{sid}/public')).status==404
        finally: await client.close()
    asyncio.run(scenario())


def test_websocket_teacher_student_and_teacher_reconnect(tmp_path, monkeypatch):
    async def scenario():
        monkeypatch.setattr(server, 'STATE_FILE', tmp_path / 'sessions.json')
        server.SESSIONS.clear(); server.TEACHER_WS.clear(); server.STUDENT_WS.clear()
        ts = TestServer(server.create_app())
        client = TestClient(ts)
        await client.start_server()
        async def recv_type(ws, wanted, limit=10):
            for _ in range(limit):
                msg = await ws.receive_json(timeout=2)
                if msg.get('type') == wanted:
                    return msg
            raise AssertionError(f'message {wanted} not received')
        try:
            r = await client.post('/api/session', json={'title':'A-10 test'})
            created = await r.json(); sid = created['session_id']
            r = await client.post(f'/api/session/{sid}/join', json={'student_id':'S1','name':'テスト タロウ','seat_no':1})
            p = await r.json()

            tws = await client.ws_connect(f'/ws/{sid}?role=teacher&token={created["teacher_token"]}')
            roster = await recv_type(tws, 'roster')
            assert roster['session']['participants'][0]['seat_no'] == 1

            sws = await client.ws_connect(f'/ws/{sid}?role=student&participant_id={p["participant_id"]}&token={p["participant_token"]}')
            welcome = await recv_type(sws, 'welcome')
            assert welcome['teacher_present'] is True
            joined = await recv_type(tws, 'participant_joined')
            assert joined['participant']['student_id'] == 'S1'
            assert joined['participant']['sharing'] is False

            await sws.send_json({'type':'share_state','active':True})
            share = await recv_type(tws, 'participant_share_state')
            assert share['participant_id'] == p['participant_id'] and share['sharing'] is True

            await sws.send_json({'type':'heartbeat'})
            heartbeat = await recv_type(tws, 'participant_heartbeat')
            assert heartbeat['participant_id'] == p['participant_id']
            assert isinstance(heartbeat['last_seen'], (int, float))

            await sws.send_json({'type':'state','hand':True,'answer':'yes'})
            state = await recv_type(tws, 'participant_state')
            assert state['hand'] is True and state['answer'] == 'yes'

            await tws.send_json({'type':'teacher_message','target':p['participant_id'],'text':'そのまま待ってください'})
            tm = await recv_type(sws, 'teacher_message')
            assert tm['text'] == 'そのまま待ってください'

            await tws.close()
            gone = await recv_type(sws, 'teacher_presence')
            assert gone['present'] is False
            r = await client.get(f'/api/session/{sid}/public')
            assert r.status == 200  # browser close != session end

            tws2 = await client.ws_connect(f'/ws/{sid}?role=teacher&token={created["teacher_token"]}')
            await recv_type(tws2, 'roster')
            back = await recv_type(sws, 'teacher_presence')
            assert back['present'] is True
            await tws2.close(); await sws.close()
        finally:
            await client.close()
    asyncio.run(scenario())
