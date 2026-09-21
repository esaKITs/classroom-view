import csv, io, asyncio, json, os, re, secrets, time
from pathlib import Path
from typing import Dict, Any
from aiohttp import web, WSMsgType

BASE=Path(__file__).resolve().parent; STATIC=BASE/'static'
# Persistent user data lives outside the application directory by default.
# Override with CLASSROOM_VIEW_DATA_DIR for servers/containers.
DATA_DIR=Path(os.environ.get('CLASSROOM_VIEW_DATA_DIR', Path.home()/'.esakits'/'classroom-view')).expanduser()
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE=DATA_DIR/'state.json'; LEGACY_STATE_FILE=BASE/'state.json'
CLASSES:Dict[str,Dict[str,Any]]={}; SESSIONS:Dict[str,Dict[str,Any]]={}; TEACHER_WS={}; STUDENT_WS={}
DEFAULT_LAYOUT={
 'rows':8,'cols':6,'vertical_aisles':[2,4],'horizontal_aisles':[],
 'numbering':'vertical','start_side':'left',
 'disabled_positions':[[0,0],[0,1],[0,5]],
 'seat_map':[
  [None,None,22,30,38,None],[7,14,21,29,37,45],[6,13,20,28,36,44],[5,12,19,27,35,43],
  [4,11,18,26,34,42],[3,10,17,25,33,41],[2,9,16,24,32,40],[1,8,15,23,31,39]
 ]}

TABLE_LAYOUT_PRESET={
 'type':'round_tables','table_rows':2,'table_cols':3,'seats_per_table':3,
 'rows':2,'cols':3,'vertical_aisles':[],'horizontal_aisles':[],
 'numbering':'table','start_side':'left','disabled_positions':[],
 'tables':[
  {'table':1,'row':1,'col':0,'seats':[1,2,3]},
  {'table':2,'row':0,'col':0,'seats':[4,5,6]},
  {'table':3,'row':1,'col':1,'seats':[7,8,9]},
  {'table':4,'row':0,'col':1,'seats':[10,11,12]},
  {'table':5,'row':1,'col':2,'seats':[13,14,15]},
  {'table':6,'row':0,'col':2,'seats':[16,17,18]}
 ],
 'seat_map':[[4,5,6,10,11,12,16,17,18],[1,2,3,7,8,9,13,14,15]]
}

DEFAULT_DISPLAY={'seat':True,'student_id':True,'surname':True,'given_name':True,'joined_at':False,'connected':False}

def now(): return time.time()
def code(n=6):
 a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return ''.join(secrets.choice(a) for _ in range(n))
def token(n=24): return secrets.token_urlsafe(n)
def recovery_code(): return '-'.join(code(4) for _ in range(3))
def clone(x): return json.loads(json.dumps(x))
def valid_student_id(v): return bool(re.fullmatch(r'[A-Za-z0-9]+',v or ''))
def normalize_student_id(v): return (v or '').strip().upper()
def valid_katakana(v): return bool(v and re.fullmatch(r'[ァ-ヶー・･\s]+',v))

def generate_layout(rows,cols,disabled_positions=None,numbering='vertical',start_side='left',vertical_aisles=None,horizontal_aisles=None):
 rows=max(1,min(12,int(rows))); cols=max(1,min(12,int(cols)))
 disabled={tuple(x) for x in (disabled_positions or []) if len(x)==2 and 0<=int(x[0])<rows and 0<=int(x[1])<cols}
 sm=[[None]*cols for _ in range(rows)]; n=1
 cs=list(range(cols)) if start_side=='left' else list(reversed(range(cols)))
 if numbering=='horizontal':
  for r in reversed(range(rows)):
   for c in cs:
    if (r,c) not in disabled: sm[r][c]=n; n+=1
 else:
  for c in cs:
   for r in reversed(range(rows)):
    if (r,c) not in disabled: sm[r][c]=n; n+=1
 return {'rows':rows,'cols':cols,'vertical_aisles':sorted(set(int(x) for x in (vertical_aisles or []) if 1<=int(x)<cols))[:11],
 'horizontal_aisles':sorted(set(int(x) for x in (horizontal_aisles or []) if 1<=int(x)<rows))[:11],
 'numbering':numbering if numbering in ('vertical','horizontal') else 'vertical','start_side':start_side if start_side in ('left','right') else 'left',
 'disabled_positions':[list(x) for x in sorted(disabled)],'seat_map':sm}

def default_layout(): return clone(DEFAULT_LAYOUT)
def round_table_layout(table_rows=2,table_cols=3):
 table_rows=max(1,min(12,int(table_rows))); table_cols=max(1,min(12,int(table_cols)))
 tables=[]; n=1
 # Number tables from the teacher/front row (bottom) left-to-right, then move backward.
 for visual_r in reversed(range(table_rows)):
  for c in range(table_cols):
   tables.append({'table':len(tables)+1,'row':visual_r,'col':c,'seats':[n,n+1,n+2]}); n+=3
 # seat_map is only a compatibility/index map; rendering uses tables.
 return {'type':'round_tables','table_rows':table_rows,'table_cols':table_cols,'seats_per_table':3,
  'rows':table_rows,'cols':table_cols,'vertical_aisles':[],'horizontal_aisles':[],
  'numbering':'table','start_side':'left','disabled_positions':[],'tables':tables,
  'seat_map':[[seat for t in tables if t['row']==r for seat in t['seats']] for r in range(table_rows)]}
def seat_numbers(rows=8,cols=6): return generate_layout(rows,cols)['seat_map']
def valid_seats(layout):
 if layout.get('type')=='round_tables': return {n for t in layout.get('tables',[]) for n in t.get('seats',[])}
 return {n for row in layout['seat_map'] for n in row if n is not None}
def seat_position(layout,seat):
 if layout.get('type')=='round_tables':
  for t in layout.get('tables',[]):
   if seat in t.get('seats',[]): return [t['row'],t['col'],t['seats'].index(seat)]
  return None
 for r,row in enumerate(layout['seat_map']):
  for c,n in enumerate(row):
   if n==seat:return [r,c]
 return None

def persist():
 data={'classes':CLASSES,'sessions':SESSIONS}; tmp=STATE_FILE.with_suffix('.tmp'); tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8'); tmp.replace(STATE_FILE)
def load_state():
 # One-time migration from versions that stored state beside the program.
 if not STATE_FILE.exists() and LEGACY_STATE_FILE.exists():
  try:
   STATE_FILE.write_text(LEGACY_STATE_FILE.read_text(encoding='utf-8'),encoding='utf-8')
  except Exception: pass
 if not STATE_FILE.exists(): return
 try:
  d=json.loads(STATE_FILE.read_text(encoding='utf-8')); CLASSES.update(d.get('classes',{})); SESSIONS.update(d.get('sessions',{}))
  for s in SESSIONS.values():
   s['teacher_present']=False;s['teacher_share_active']=False
   for p in s.get('participants',{}).values():p['connected']=False;p['sharing']=False
 except Exception: pass

def public_session(s):
 c=CLASSES.get(s.get('class_code'),{})
 return {'session_id':s['session_id'],'class_code':s.get('class_code'),'title':s['title'],'layout':clone(s['layout']),'active':s['active'],'teacher_present':s.get('teacher_present',False),'teacher_share_active':s.get('teacher_share_active',False)}
def roster_session(s):
 out=public_session(s); out['display_settings']=clone(CLASSES.get(s.get('class_code'),{}).get('display_settings',DEFAULT_DISPLAY)); out['participants']=[]
 for pid,p in s.get('participants',{}).items():
  if not p.get('active',True):continue
  q={k:p.get(k) for k in ['student_id','surname','given_name','seat_no','hand','answer','last_message','connected','sharing','last_seen','joined_at','left_at','device_type','device_label','share_capability']};q['participant_id']=pid
  out['participants'].append(q)
 return out

def add_event(p,typ): p.setdefault('events',[]).append({'type':typ,'at':now()})

async def index(r): return web.FileResponse(STATIC/'teacher.html')
async def teacher_page(r): return web.FileResponse(STATIC/'teacher.html')
async def student_page(r): return web.FileResponse(STATIC/'student.html')

async def list_classes(request):
 return web.json_response([{'class_code':c['class_code'],'title':c['title'],'student_url':f"{request.scheme}://{request.host}/class/{c['class_code']}"} for c in CLASSES.values()])
async def create_class(request):
 d=await request.json(); cc=code(6)
 while cc in CLASSES:cc=code(6)
 c={'class_code':cc,'title':(d.get('title') or '授業').strip()[:80],'layout':default_layout(),'display_settings':clone(DEFAULT_DISPLAY),'created_at':now()};CLASSES[cc]=c;persist()
 return web.json_response({**c,'student_url':f"{request.scheme}://{request.host}/class/{cc}"})
async def get_class(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c: raise web.HTTPNotFound(text='授業がありません')
 active=next((s for s in SESSIONS.values() if s.get('class_code')==c['class_code'] and s.get('active')),None)
 return web.json_response({**c,'active_session_id':active['session_id'] if active else None})
async def update_class(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c: raise web.HTTPNotFound()
 d=await request.json()
 if 'title'in d:c['title']=(d['title'] or c['title']).strip()[:80]
 if 'display_settings'in d:c['display_settings']={**DEFAULT_DISPLAY,**d['display_settings']}
 if 'layout'in d:
  if any(s.get('active') and s.get('class_code')==c['class_code'] and s.get('participants') for s in SESSIONS.values()): raise web.HTTPConflict(text='参加者がいるため座席構造を変更できません')
  x=d['layout']
  if x.get('type')=='round_tables':
   c['layout']=round_table_layout(x.get('table_rows',2),x.get('table_cols',3))
  else:
   c['layout']=generate_layout(x.get('rows',8),x.get('cols',6),x.get('disabled_positions',[]),x.get('numbering','vertical'),x.get('start_side','left'),x.get('vertical_aisles',[]),x.get('horizontal_aisles',[]))
  for active in SESSIONS.values():
   if active.get('active') and active.get('class_code')==c['class_code'] and not active.get('participants'):
    active['layout']=clone(c['layout'])
 persist();return web.json_response(c)
async def reset_class_layout(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c:raise web.HTTPNotFound()
 c['layout']=default_layout();
 for active in SESSIONS.values():
  if active.get('active') and active.get('class_code')==c['class_code'] and not active.get('participants'):active['layout']=clone(c['layout'])
 persist();return web.json_response(c)

async def start_class_session(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c:raise web.HTTPNotFound()
 for s in SESSIONS.values():
  if s.get('class_code')==c['class_code'] and s.get('active'): return web.json_response({'session_id':s['session_id'],'teacher_token':s['teacher_token'],'recovery_code':s['recovery_code'],'join_url':f"{request.scheme}://{request.host}/class/{c['class_code']}"})
 sid=code(6)
 while sid in SESSIONS:sid=code(6)
 s={'session_id':sid,'class_code':c['class_code'],'title':c['title'],'layout':clone(c['layout']),'teacher_token':token(),'recovery_code':recovery_code(),'created_at':now(),'active':True,'teacher_present':False,'teacher_share_active':False,'participants':{}}
 SESSIONS[sid]=s;STUDENT_WS[sid]={};persist();return web.json_response({'session_id':sid,'teacher_token':s['teacher_token'],'recovery_code':s['recovery_code'],'join_url':f"{request.scheme}://{request.host}/class/{c['class_code']}"})

# v0.1-compatible quick create: creates a persistent class then starts it.
async def create_session(request):
 d=await request.json(); fake=type('R',(),{})(); cc=code(6)
 c={'class_code':cc,'title':(d.get('title') or '授業').strip()[:80],'layout':default_layout(),'display_settings':clone(DEFAULT_DISPLAY),'created_at':now()}
 if any(k in d for k in ('rows','cols','disabled_seats')):
  rows=int(d.get('rows',8));cols=int(d.get('cols',6)); disabled=[]
  # compatibility: disabled_seats are seat numbers in a generated rectangular layout
  lay=generate_layout(rows,cols)
  for n in d.get('disabled_seats',[]):
   pos=seat_position(lay,int(n)) if str(n).isdigit() else None
   if pos:disabled.append(pos)
  c['layout']=generate_layout(rows,cols,disabled)
 CLASSES[cc]=c;persist();request.match_info['cc']=cc
 return await start_class_session(request)

async def recover_session(request):
 d=await request.json();rec=(d.get('recovery_code')or'').strip().upper()
 for sid,s in SESSIONS.items():
  if s.get('active') and s.get('recovery_code')==rec:return web.json_response({'session_id':sid,'teacher_token':s['teacher_token'],'title':s['title'],'class_code':s.get('class_code')})
 raise web.HTTPNotFound(text='復旧コードが見つかりません')
async def get_public_session(request):
 s=SESSIONS.get(request.match_info['sid']);
 if not s or not s.get('active'):raise web.HTTPNotFound(text='この授業は終了しています')
 return web.json_response(public_session(s))
async def get_public_class(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c:raise web.HTTPNotFound(text='授業がありません')
 s=next((s for s in SESSIONS.values() if s.get('class_code')==c['class_code'] and s.get('active')),None)
 if not s:raise web.HTTPNotFound(text='現在セッションは開始されていません')
 return web.json_response(public_session(s))
async def get_teacher_session(request):
 s=SESSIONS.get(request.match_info['sid']);
 if not s or not s.get('active'):raise web.HTTPNotFound(text='授業がありません')
 if request.query.get('token')!=s.get('teacher_token'):raise web.HTTPForbidden(text='権限がありません')
 return web.json_response({**roster_session(s),'recovery_code':s['recovery_code']})

async def join_session(request):
 s=SESSIONS.get(request.match_info['sid']);
 if not s or not s.get('active'):raise web.HTTPNotFound(text='この授業は終了しています')
 d=await request.json(); seat=int(d.get('seat_no',0)); student_id=normalize_student_id(d.get('student_id'))
 surname=(d.get('surname') or '').strip();given=(d.get('given_name') or '').strip()
 device_type=str(d.get('device_type') or 'desktop')[:24];device_label=str(d.get('device_label') or 'PC')[:40];share_capability=str(d.get('share_capability') or 'web')[:24]
 # v0.1 compatibility
 if not surname and not given and d.get('name'):
  bits=str(d['name']).strip().split(maxsplit=1);surname=bits[0];given=bits[1] if len(bits)>1 else 'ー'
 if seat not in valid_seats(s['layout']):raise web.HTTPBadRequest(text='この座席は使用できません')
 if not valid_student_id(student_id):raise web.HTTPBadRequest(text='学籍番号は半角英数字で入力してください')
 if not valid_katakana(surname) or not valid_katakana(given):raise web.HTTPBadRequest(text='姓・名はカタカナで入力してください')
 pid=d.get('participant_id');pt=d.get('participant_token')
 if pid in s['participants'] and s['participants'][pid].get('participant_token')==pt:
  p=s['participants'][pid];p.update(student_id=student_id,surname=surname,given_name=given,seat_no=seat,device_type=device_type,device_label=device_label,share_capability=share_capability,active=True,last_seen=now());add_event(p,'rejoin');persist();return web.json_response({'participant_id':pid,'participant_token':pt,'seat_no':seat})
 pid=token(9);pt=token(18);t=now();s['participants'][pid]={'participant_token':pt,'student_id':student_id,'surname':surname,'given_name':given,'seat_no':seat,'device_type':device_type,'device_label':device_label,'share_capability':share_capability,'hand':False,'answer':'','last_message':'','active':True,'connected':False,'sharing':False,'joined_at':t,'left_at':None,'last_seen':t,'events':[{'type':'join','at':t}]};persist();return web.json_response({'participant_id':pid,'participant_token':pt,'seat_no':seat})
async def join_class(request):
 c=CLASSES.get(request.match_info['cc']);
 if not c:raise web.HTTPNotFound()
 s=next((s for s in SESSIONS.values() if s.get('class_code')==c['class_code'] and s.get('active')),None)
 if not s:raise web.HTTPNotFound(text='現在セッションは開始されていません')
 request.match_info['sid']=s['session_id'];return await join_session(request)

async def change_seat(request):
 s=SESSIONS.get(request.match_info['sid']);d=await request.json()
 if not s or d.get('teacher_token')!=s.get('teacher_token'):raise web.HTTPForbidden()
 p=s['participants'].get(request.match_info['pid']);
 if not p:raise web.HTTPNotFound()
 seat=int(d.get('seat_no',0));
 if seat not in valid_seats(s['layout']):raise web.HTTPBadRequest(text='この座席は使用できません')
 old=p['seat_no'];p['seat_no']=seat;p.setdefault('events',[]).append({'type':'seat_change','at':now(),'from':old,'to':seat});persist();await send_teacher(s['session_id'],{'type':'roster','session':roster_session(s)});return web.json_response({'ok':True,'seat_no':seat})

async def end_session(request):
 s=SESSIONS.get(request.match_info['sid']);
 if not s:raise web.HTTPNotFound()
 d=await request.json();
 if d.get('teacher_token')!=s.get('teacher_token'):raise web.HTTPForbidden()
 s['active']=False;s['teacher_share_active']=False;s['ended_at']=now();persist();await broadcast_students(s['session_id'],{'type':'session_ended'});return web.json_response({'ok':True})

async def export_csv(request):
 s=SESSIONS.get(request.match_info['sid']);
 if not s or request.query.get('token')!=s.get('teacher_token'):raise web.HTTPForbidden()
 buf=io.StringIO();w=csv.writer(buf);w.writerow(['学籍番号','姓','名','座席番号','初回入室時刻','最終退出時刻'])
 from datetime import datetime
 fmt=lambda x: datetime.fromtimestamp(x).strftime('%Y-%m-%d %H:%M:%S') if x else ''
 for p in s.get('participants',{}).values():w.writerow([p['student_id'],p['surname'],p['given_name'],f"{p['seat_no']:02d}",fmt(p.get('joined_at')),fmt(p.get('left_at'))])
 return web.Response(body=('\ufeff'+buf.getvalue()).encode('utf-8'),content_type='text/csv',headers={'Content-Disposition':f'attachment; filename="A10_{s["session_id"]}.csv"'})

async def broadcast_students(sid,payload):
 for pid,ws in list(STUDENT_WS.get(sid,{}).items()):
  if not ws.closed:
   try:await ws.send_json(payload)
   except:pass
async def send_teacher(sid,payload):
 ws=TEACHER_WS.get(sid)
 if ws and not ws.closed:await ws.send_json(payload)

async def ws_handler(request):
 sid=request.match_info['sid'];s=SESSIONS.get(sid)
 if not s or not s.get('active'):raise web.HTTPNotFound()
 role=request.query.get('role');ws=web.WebSocketResponse(heartbeat=20);await ws.prepare(request);pid=None
 if role=='teacher':
  if request.query.get('token')!=s.get('teacher_token'):await ws.close(code=4003);return ws
  old=TEACHER_WS.get(sid)
  if old and not old.closed:await old.close(code=4000)
  TEACHER_WS[sid]=ws;s['teacher_present']=True;persist();await ws.send_json({'type':'roster','session':roster_session(s)});await broadcast_students(sid,{'type':'teacher_presence','present':True})
 elif role=='student':
  pid=request.query.get('participant_id');p=s['participants'].get(pid or '')
  if not p or request.query.get('token')!=p.get('participant_token'):await ws.close(code=4003);return ws
  STUDENT_WS.setdefault(sid,{})[pid]=ws;p['connected']=True;p['last_seen']=now();add_event(p,'connect');persist();await ws.send_json({'type':'welcome','teacher_present':s.get('teacher_present',False),'teacher_share_active':s.get('teacher_share_active',False),'session':public_session(s)});await send_teacher(sid,{'type':'participant_joined','participant':next(x for x in roster_session(s)['participants'] if x['participant_id']==pid)})
 else:await ws.close(code=4003);return ws
 try:
  async for msg in ws:
   if msg.type!=WSMsgType.TEXT:continue
   try:d=json.loads(msg.data)
   except:continue
   typ=d.get('type')
   if role=='teacher':
    if typ=='signal':
     sw=STUDENT_WS.get(sid,{}).get(d.get('target'))
     if sw and not sw.closed:await sw.send_json({'type':'signal','data':d.get('data',{})})
    elif typ=='quality':
     sw=STUDENT_WS.get(sid,{}).get(d.get('target'))
     if sw and not sw.closed:await sw.send_json({'type':'quality','mode':d.get('mode','thumb')})
    elif typ=='teacher_message':
     payload={'type':'teacher_message','text':str(d.get('text',''))[:300]};target=d.get('target','all')
     if target=='all':await broadcast_students(sid,payload)
     else:
      sw=STUDENT_WS.get(sid,{}).get(target)
      if sw and not sw.closed:await sw.send_json(payload)
    elif typ=='teacher_share_state':s['teacher_share_active']=bool(d.get('active'));persist();await broadcast_students(sid,{'type':'teacher_share_state','active':s['teacher_share_active']})
    elif typ=='reset_answers':
     for p in s['participants'].values():p['answer']=''
     persist();await broadcast_students(sid,{'type':'answer_reset'});await ws.send_json({'type':'roster','session':roster_session(s)})
   else:
    p=s['participants'].get(pid);p['last_seen']=now()
    if typ=='signal':await send_teacher(sid,{'type':'signal','from':pid,'data':d.get('data',{})})
    elif typ=='heartbeat':await send_teacher(sid,{'type':'participant_heartbeat','participant_id':pid,'last_seen':p['last_seen']})
    elif typ=='share_state':p['sharing']=bool(d.get('active'));await send_teacher(sid,{'type':'participant_share_state','participant_id':pid,'sharing':p['sharing']})
    elif typ=='state':p['hand']=bool(d.get('hand',p['hand']));p['answer']=d.get('answer',p['answer']) if d.get('answer',p['answer']) in ('','yes','no') else p['answer'];persist();await send_teacher(sid,{'type':'participant_state','participant_id':pid,'hand':p['hand'],'answer':p['answer']})
    elif typ=='student_message':p['last_message']=str(d.get('text','')).strip()[:300];persist();await send_teacher(sid,{'type':'student_message','participant_id':pid,'text':p['last_message']})
 finally:
  if role=='teacher' and TEACHER_WS.get(sid) is ws:TEACHER_WS.pop(sid,None);s['teacher_present']=False;s['teacher_share_active']=False;persist();await broadcast_students(sid,{'type':'teacher_presence','present':False});await broadcast_students(sid,{'type':'teacher_share_state','active':False})
  elif pid and STUDENT_WS.get(sid,{}).get(pid) is ws:
   STUDENT_WS[sid].pop(pid,None);p=s['participants'].get(pid)
   if p:p['connected']=False;p['sharing']=False;p['left_at']=now();add_event(p,'disconnect');persist();await send_teacher(sid,{'type':'participant_network_lost','participant_id':pid,'last_seen':p.get('last_seen')})
 return ws

async def qr_png(request):
 import qrcode;value=request.query.get('value','')[:500]
 if not value:raise web.HTTPBadRequest()
 b=io.BytesIO();qrcode.make(value).save(b,format='PNG');return web.Response(body=b.getvalue(),content_type='image/png')

async def export_backup(request):
 data={'format':'esaKITs-Classroom-View-backup-v1','exported_at':now(),'classes':CLASSES,'sessions':SESSIONS}
 body=json.dumps(data,ensure_ascii=False,indent=2).encode('utf-8')
 return web.Response(body=body,content_type='application/json',headers={'Content-Disposition':'attachment; filename="classroom-view-backup.json"'})

async def import_backup(request):
 try: d=await request.json()
 except Exception: raise web.HTTPBadRequest(text='JSONを読み込めません')
 if d.get('format')!='esaKITs-Classroom-View-backup-v1' or not isinstance(d.get('classes'),dict) or not isinstance(d.get('sessions'),dict):
  raise web.HTTPBadRequest(text='Classroom Viewのバックアップではありません')
 CLASSES.clear(); CLASSES.update(d['classes']); SESSIONS.clear(); SESSIONS.update(d['sessions']); persist()
 return web.json_response({'ok':True,'classes':len(CLASSES),'sessions':len(SESSIONS)})

async def config(request):
 try:ice=json.loads(os.environ.get('A10_ICE_SERVERS','[]'));ice=ice if isinstance(ice,list) else []
 except:ice=[]
 return web.json_response({'iceServers':ice})

def create_app():
 app=web.Application(client_max_size=2*1024*1024)
 app.router.add_get('/',index);app.router.add_get('/teacher',teacher_page);app.router.add_get('/join/{sid}',student_page);app.router.add_get('/class/{cc}',student_page)
 app.router.add_get('/api/classes',list_classes);app.router.add_post('/api/classes',create_class);app.router.add_get('/api/class/{cc}',get_class);app.router.add_post('/api/class/{cc}',update_class);app.router.add_post('/api/class/{cc}/reset-layout',reset_class_layout);app.router.add_post('/api/class/{cc}/session',start_class_session);app.router.add_get('/api/class/{cc}/public',get_public_class);app.router.add_post('/api/class/{cc}/join',join_class)
 app.router.add_post('/api/session',create_session);app.router.add_post('/api/recover',recover_session);app.router.add_get('/api/session/{sid}/public',get_public_session);app.router.add_get('/api/session/{sid}',get_teacher_session);app.router.add_post('/api/session/{sid}/join',join_session);app.router.add_post('/api/session/{sid}/participant/{pid}/seat',change_seat);app.router.add_post('/api/session/{sid}/end',end_session);app.router.add_get('/api/session/{sid}/csv',export_csv)
 app.router.add_get('/api/qr',qr_png);app.router.add_get('/api/config',config);app.router.add_get('/api/backup',export_backup);app.router.add_post('/api/backup/import',import_backup);app.router.add_get('/ws/{sid}',ws_handler);app.router.add_static('/static/',STATIC,show_index=False);return app
load_state();app=create_app()
if __name__=='__main__':web.run_app(app,host='0.0.0.0',port=int(os.environ.get('PORT','8080')))
