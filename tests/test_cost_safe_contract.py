from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'cost-safe'/'prototype.html').read_text(encoding='utf-8')
JS=(ROOT/'cost-safe'/'prototype.js').read_text(encoding='utf-8')

def test_cost_safe_prototype_has_no_billable_backend_contract():
    combined=HTML+'\n'+JS
    forbidden=['firebase','supabase','railway','render.com','wss://','ws://','turn:','turns:','stun:']
    for token in forbidden:
        assert token not in combined.lower(), token

def test_cost_safe_peer_has_no_ice_servers():
    assert 'RTCPeerConnection({iceServers:[]})' in JS

def test_cost_safe_prototype_uses_manual_signaling():
    assert 'createOffer' in JS
    assert 'createAnswer' in JS
    assert 'setRemoteDescription' in JS
    assert 'getDisplayMedia' in JS
