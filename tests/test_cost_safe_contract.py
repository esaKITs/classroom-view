from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILES=[ROOT/'cost-safe'/x for x in ['index.html','teacher.html','student.html','teacher.js','student.js','common.css','teacher.css','student.css']]
COMBINED='\n'.join(p.read_text(encoding='utf-8') for p in FILES)
def test_files_exist(): assert all(p.exists() for p in FILES)
def test_no_author_billable_infrastructure():
 low=COMBINED.lower()
 for token in ['firebase','supabase','railway','render.com','vercel','turn:','turns:','amazonaws.com']: assert token not in low,token
def test_static_global_signaling_and_screen_capture():
 for token in ['peerjs','getdisplaymedia','peer.call','peer.connect']: assert token in COMBINED.lower(),token
def test_no_app_backend_calls():
 low=COMBINED.lower(); assert 'fetch(' not in low; assert 'xmlhttprequest' not in low; assert 'websocket(' not in low
def test_core_classroom_controls_present():
 for token in ['参加url','全員へ短信','yes/no解除','教師画面共有','授業終了','挙手','csv']: assert token.lower() in COMBINED.lower(),token
