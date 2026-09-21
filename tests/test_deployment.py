import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cv_deployment', ROOT / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


@pytest.mark.parametrize('explicit_origin', [False, True])
def test_https_participation_urls_behind_http_proxy(tmp_path, monkeypatch, explicit_origin):
    monkeypatch.setattr(server, 'STATE_FILE', tmp_path / 'state.json')
    monkeypatch.delenv('PUBLIC_BASE_URL', raising=False)
    monkeypatch.setenv('RAILWAY_PUBLIC_DOMAIN', 'classroom.example.test')
    origin = 'https://classroom.example.test'
    if explicit_origin:
        origin = 'https://custom.example.test'
        monkeypatch.setenv('PUBLIC_BASE_URL', origin + '/')
    server.CLASSES.clear()
    server.SESSIONS.clear()
    server.TEACHER_WS.clear()
    server.STUDENT_WS.clear()

    async def scenario():
        client = TestClient(TestServer(server.create_app()))
        await client.start_server()
        try:
            response = await client.post('/api/classes', json={'title': 'Deployment test'},
                headers={'X-Forwarded-Host': 'untrusted.example.test', 'X-Forwarded-Proto': 'http'})
            assert response.status == 200
            classroom = await response.json()
            expected = origin + '/class/' + classroom['class_code']
            assert classroom['student_url'] == expected
            listing = await (await client.get('/api/classes')).json()
            assert listing[0]['student_url'] == expected
            for _ in range(2):
                started = await (await client.post(
                    f'/api/class/{classroom["class_code"]}/session', json={})).json()
                assert started['join_url'] == expected
        finally:
            await client.close()

    asyncio.run(scenario())


def test_local_origin_is_preserved(monkeypatch):
    monkeypatch.delenv('PUBLIC_BASE_URL', raising=False)
    monkeypatch.delenv('RAILWAY_PUBLIC_DOMAIN', raising=False)
    assert server.public_origin(SimpleNamespace(scheme='http', host='localhost:8080')) == 'http://localhost:8080'


@pytest.mark.parametrize('origin', ['javascript:alert(1)', 'https://user:secret@example.test',
                                    'https://example.test/path', 'https://example.test?key=value'])
def test_invalid_external_origin_is_rejected(monkeypatch, origin):
    monkeypatch.setenv('PUBLIC_BASE_URL', origin)
    with pytest.raises(ValueError):
        server.public_origin(SimpleNamespace(scheme='http', host='localhost:8080'))
