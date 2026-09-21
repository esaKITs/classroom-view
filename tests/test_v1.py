import asyncio, importlib.util, json
from pathlib import Path
from aiohttp.test_utils import TestClient, TestServer
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('a10v1',ROOT/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)

def test_default_layout_exact():
 L=server.default_layout()
 assert L['seat_map']==[[None,None,22,30,38,None],[7,14,21,29,37,45],[6,13,20,28,36,44],[5,12,19,27,35,43],[4,11,18,26,34,42],[3,10,17,25,33,41],[2,9,16,24,32,40],[1,8,15,23,31,39]]
 assert len(server.valid_seats(L))==45 and server.valid_seats(L)==set(range(1,46))
 assert L['vertical_aisles']==[2,4] and len(L['disabled_positions'])==3

def test_layout_limits_and_numbering():
 L=server.generate_layout(12,12,vertical_aisles=list(range(1,12)),horizontal_aisles=list(range(1,12)))
 assert L['rows']==12 and L['cols']==12 and len(L['vertical_aisles'])==11 and len(L['horizontal_aisles'])==11
 assert len(server.valid_seats(L))==144
 H=server.generate_layout(2,3,numbering='horizontal',start_side='right')
 assert H['seat_map']==[[6,5,4],[3,2,1]]

def test_validation():
 assert server.valid_student_id('Ab12') and server.normalize_student_id('ab12')=='AB12'
 assert not server.valid_student_id('Ａ１２') and not server.valid_student_id('A-1')
 assert server.valid_katakana('ヴァレリイア') and server.valid_katakana('リー・アン')
 assert not server.valid_katakana('佐藤')

def test_class_session_duplicate_privacy_logs_csv_and_seat_change(tmp_path,monkeypatch):
 async def run():
  monkeypatch.setattr(server,'STATE_FILE',tmp_path/'state.json');server.CLASSES.clear();server.SESSIONS.clear();server.TEACHER_WS.clear();server.STUDENT_WS.clear()
  client=TestClient(TestServer(server.create_app()));await client.start_server()
  try:
   r=await client.post('/api/classes',json={'title':'English Phonetics IB'});assert r.status==200;c=await r.json();cc=c['class_code'];assert c['student_url'].endswith('/class/'+cc)
   r=await client.post(f'/api/class/{cc}/session',json={});st=await r.json();sid=st['session_id'];tok=st['teacher_token']
   payload={'student_id':'a001','surname':'サトウ','given_name':'ハナコ','seat_no':12}
   r=await client.post(f'/api/class/{cc}/join',json=payload);assert r.status==200;p1=await r.json()
   r=await client.post(f'/api/class/{cc}/join',json={'student_id':'A002','surname':'スズキ','given_name':'タロウ','seat_no':12});assert r.status==200;p2=await r.json()
   pub=await (await client.get(f'/api/session/{sid}/public')).json();dump=json.dumps(pub,ensure_ascii=False);assert 'A001' not in dump and 'サトウ' not in dump and 'participants' not in pub
   roster=await (await client.get(f'/api/session/{sid}?token={tok}')).json();assert [p['seat_no'] for p in roster['participants']].count(12)==2;assert roster['participants'][0]['student_id']=='A001'
   r=await client.post(f'/api/session/{sid}/participant/{p2["participant_id"]}/seat',json={'teacher_token':tok,'seat_no':13});assert r.status==200
   r=await client.post(f'/api/session/{sid}/participant/{p2["participant_id"]}/seat',json={'teacher_token':tok,'seat_no':99});assert r.status==400
   r=await client.get(f'/api/session/{sid}/csv?token={tok}');assert r.status==200;txt=(await r.read()).decode('utf-8-sig');assert '学籍番号' in txt and 'A001' in txt
   r=await client.post(f'/api/class/{cc}/join',json={'student_id':'A003','surname':'タナカ','given_name':'ケン','seat_no':46});assert r.status==400
   await client.post(f'/api/session/{sid}/end',json={'teacher_token':tok});assert (await client.get(f'/api/session/{sid}/public')).status==404
  finally: await client.close()
 asyncio.run(run())

def test_static_contract_v1():
 t=(ROOT/'static/teacher.js').read_text();h=(ROOT/'static/teacher.html').read_text();s=(ROOT/'static/student.js').read_text();sh=(ROOT/'static/student.html').read_text()
 for x in ['snapshotPNG','PNG保存','viewMode','/participant/${p.participant_id}/seat','CSV']: assert x in (t+h)
 assert 'rotate(180deg)' in (ROOT/'static/student.css').read_text()
 assert 'surname' in s and 'given_name' in s and 'studentSeatMap' in sh
