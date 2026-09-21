from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILES=[
    ROOT/'cost-safe'/'index.html',
    ROOT/'cost-safe'/'app.js',
    ROOT/'cost-safe'/'prototype.html',
    ROOT/'cost-safe'/'prototype.js',
]
COMBINED='\n'.join(p.read_text(encoding='utf-8') for p in FILES)

def test_cost_safe_files_exist():
    assert all(p.exists() for p in FILES)

def test_no_billable_backend_or_relay_contract():
    forbidden=[
        'firebase','supabase','railway','render.com','vercel',
        'wss://','ws://','turn:','turns:','stun:',
        'googleapis.com','amazonaws.com'
    ]
    low=COMBINED.lower()
    for token in forbidden:
        assert token not in low, token

def test_peer_has_no_ice_servers():
    assert 'RTCPeerConnection({iceServers:[]})' in COMBINED

def test_manual_signaling_and_screen_capture_present():
    for token in ['createOffer','createAnswer','setRemoteDescription','getDisplayMedia']:
        assert token in COMBINED

def test_no_runtime_fetch_or_xhr():
    assert 'fetch(' not in COMBINED
    assert 'XMLHttpRequest' not in COMBINED
