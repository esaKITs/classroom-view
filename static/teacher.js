const $ = (s) => document.querySelector(s);
const launch = $('#launch');
const teacherApp = $('#teacherApp');
const seatGrid = $('#seatGrid');
const modalRoot = $('#modalRoot');
const toasts = $('#toasts');
const focusOverlay = $('#focusOverlay');
const focusVideo = $('#focusVideo');

let session = null;
let teacherToken = null;
let ws = null;
let reconnectTimer = null;
let iceServers = [];
let participants = new Map();
let peers = new Map();
let focusedPid = null;
let teacherDisplayStream = null;
let teacherDisplayTrack = null;
let labelPrefs={seat:true,student_id:true,surname:true,given_name:true,joined_at:false,connected:false};
let lossTimers = new Map();
let menuTimer = null;
let demoMode = new URLSearchParams(location.search).get('demo') === '1';
let rearView = localStorage.getItem('classroom_view_orientation') === 'rear';

function toast(text, ms=2800) {
  const n = document.createElement('div');
  n.className = 'toast'; n.textContent = text; toasts.appendChild(n);
  setTimeout(() => n.remove(), ms);
}

function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

function showModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  return modalRoot.querySelector('.modal');
}
function closeModal(){ modalRoot.innerHTML=''; }

function seatNoAt(row, col, rows) { return col * rows + (rows - row); }

async function initConfig(){
  try { iceServers = (await (await fetch('/api/config')).json()).iceServers || []; } catch { iceServers = []; }
}

function wsUrl(sid, token){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/${sid}?role=teacher&token=${encodeURIComponent(token)}`;
}

async function api(path, options={}){
  const r = await fetch(path, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.json();
}

function storeActive(){
  if (!session || !teacherToken || demoMode) return;
  localStorage.setItem('a10_teacher_active', JSON.stringify({session_id:session.session_id, teacher_token:teacherToken, title:session.title}));
}
function clearActive(){ localStorage.removeItem('a10_teacher_active'); }


async function loadClasses(){
 try{const cs=await api('/api/classes');const box=$('#classList');if(!cs.length){box.innerHTML='';return;}box.innerHTML='<div class="muted" style="font-size:12px">保存済み授業</div>';for(const c of cs){const row=document.createElement('div');row.className='class-item';row.innerHTML=`<span>${esc(c.title)}</span><button class="icon-btn">開始</button>`;row.querySelector('button').onclick=()=>startExistingClass(c.class_code);box.appendChild(row)}}catch{}
}
async function startExistingClass(cc){try{const c=await api(`/api/class/${cc}`);const data=await api(`/api/class/${cc}/session`,{method:'POST',body:'{}'});teacherToken=data.teacher_token;const ss=await api(`/api/session/${data.session_id}?token=${encodeURIComponent(teacherToken)}`);session={...ss,join_url:data.join_url};storeActive();await enterTeacher();showJoinInfo()}catch(e){toast(`開始できません: ${e.message}`,5000)}}
async function startNewSession(){
  try{
    const title=$('#classTitle').value.trim()||'授業';
    const c=await api('/api/classes',{method:'POST',body:JSON.stringify({title})});
    const data=await api(`/api/class/${c.class_code}/session`,{method:'POST',body:'{}'});
    teacherToken=data.teacher_token;
    session={session_id:data.session_id,class_code:c.class_code,title:c.title,layout:c.layout,display_settings:c.display_settings,participants:[],recovery_code:data.recovery_code,join_url:data.join_url};
    storeActive();await enterTeacher();showJoinInfo();
  }catch(e){toast(`開始できません: ${e.message}`,5000);}
}

async function recoverByCode(){
  try {
    const recovery_code = $('#recovery').value.trim().toUpperCase();
    if (!recovery_code) return;
    const data = await api('/api/recover',{method:'POST',body:JSON.stringify({recovery_code})});
    teacherToken = data.teacher_token;
    const s = await api(`/api/session/${data.session_id}?token=${encodeURIComponent(teacherToken)}`);
    session = {...s, join_url:`${location.origin}/class/${s.class_code}`};
    storeActive();
    await enterTeacher();
  } catch(e){ toast(`復旧できません: ${e.message}`, 5000); }
}

async function resumeSaved(){
  try {
    const saved = JSON.parse(localStorage.getItem('a10_teacher_active') || 'null');
    if (!saved) return false;
    teacherToken = saved.teacher_token;
    const s = await api(`/api/session/${saved.session_id}?token=${encodeURIComponent(teacherToken)}`);
    session = {...s, join_url:`${location.origin}/class/${s.class_code}`};
    await enterTeacher();
    return true;
  } catch { clearActive(); return false; }
}

async function enterTeacher(){
  launch.classList.add('hidden'); teacherApp.classList.remove('hidden');
  $('#className').textContent = session.title || '授業'; $('#deskClassName').textContent=session.title||'授業'; applyOrientation();
  applyRoster(session);
  connectWs();
}

function applyRoster(s){
  if (!s) return;
  session = {...session, ...s}; if(session.display_settings) labelPrefs={...labelPrefs,...session.display_settings};
  const seen = new Set();
  for (const p of (s.participants || [])) {
    seen.add(p.participant_id);
    const old = participants.get(p.participant_id) || {};
    participants.set(p.participant_id, {...old, ...p, lossStage:p.connected ? '' : (old.lossStage||'')});
  }
  for (const [pid,p] of participants) if (!seen.has(pid) && !demoMode) participants.delete(pid);
  renderGrid();
  if (!demoMode) {
    for (const [pid,p] of participants) {
      if (p.connected) armLiveness(pid, p.last_seen || Date.now()/1000, false);
      else markLoss(pid, p.last_seen, false);
    }
  }
}

function connectWs(){
  if (!session || demoMode) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(wsUrl(session.session_id, teacherToken));
  ws.onopen = () => { if (reconnectTimer) clearTimeout(reconnectTimer); };
  ws.onmessage = async ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'roster') applyRoster(msg.session);
    else if (msg.type === 'participant_joined') {
      const old = participants.get(msg.participant.participant_id) || {};
      participants.set(msg.participant.participant_id, {...old, ...msg.participant, lossStage:''});
      armLiveness(msg.participant.participant_id, msg.participant.last_seen || Date.now()/1000);
    } else if (msg.type === 'participant_heartbeat') {
      armLiveness(msg.participant_id, msg.last_seen, false);
    } else if (msg.type === 'participant_share_state') {
      const p = participants.get(msg.participant_id); if (p) p.sharing = !!msg.sharing; renderGrid();
    } else if (msg.type === 'participant_state') {
      const p = participants.get(msg.participant_id); if (p) Object.assign(p,{hand:msg.hand,answer:msg.answer}); renderGrid();
    } else if (msg.type === 'student_message') {
      const p = participants.get(msg.participant_id); if (p) p.last_message = msg.text;
      toast(`${p?.seat_no ? p.seat_no+'番 ' : ''}${p?.name||''}: ${msg.text}`, 6000); renderGrid();
    } else if (msg.type === 'participant_network_lost') markLoss(msg.participant_id, msg.last_seen);
    else if (msg.type === 'signal') await handleSignal(msg.from, msg.data);
    else if (msg.type === 'session_ended') { clearActive(); location.reload(); }
  };
  ws.onclose = () => {
    for (const timers of lossTimers.values()) for (const t of timers) clearTimeout(t);
    lossTimers.clear();
    if (!session?.active) return;
    reconnectTimer = setTimeout(connectWs, 1200);
  };
}

function sendWs(payload){ if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }

function clearLossTimers(pid){
  for (const t of (lossTimers.get(pid)||[])) clearTimeout(t);
  lossTimers.delete(pid);
}

function armLiveness(pid,lastSeen=Date.now()/1000,renderOnRecovery=true){
  const p=participants.get(pid); if(!p) return;
  const recovered = !p.connected || !!p.lossStage;
  clearLossTimers(pid);
  p.connected=true; p.last_seen=lastSeen; p.lossStage='';
  const t1=setTimeout(()=>{
    const q=participants.get(pid); if(q){ q.lossStage='warn'; renderGrid(); }
  },5000);
  const t2=setTimeout(()=>{
    const q=participants.get(pid); if(q){ q.connected=false; q.lossStage='danger'; renderGrid(); }
  },15000);
  lossTimers.set(pid,[t1,t2]);
  if(recovered && renderOnRecovery) renderGrid();
}

function markLoss(pid,lastSeen,renderNow=true){
  const p=participants.get(pid); if(!p) return;
  clearLossTimers(pid);
  p.last_seen=lastSeen || p.last_seen || Date.now()/1000;
  const elapsed=Math.max(0, Date.now() - p.last_seen*1000);
  p.connected=elapsed < 15000;
  p.lossStage=elapsed >= 15000 ? 'danger' : elapsed >= 5000 ? 'warn' : '';
  const timers=[];
  if(elapsed < 5000) timers.push(setTimeout(()=>{ const q=participants.get(pid); if(q){ q.lossStage='warn'; renderGrid(); }},5000-elapsed));
  if(elapsed < 15000) timers.push(setTimeout(()=>{ const q=participants.get(pid); if(q){ q.connected=false; q.lossStage='danger'; renderGrid(); }},15000-elapsed));
  lossTimers.set(pid,timers);
  if(renderNow) renderGrid();
}

function renderGrid(){
  if(!session)return;
  const layout=session.layout||{rows:8,cols:6,seat_map:[]};
  const mode=$('#viewMode')?.value||'classroom';
  const groups=new Map(); for(const p of participants.values()){const k=Number(p.seat_no);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}
  seatGrid.innerHTML=''; seatGrid.className=`seat-grid mode-${mode}`;
  if(layout.type==='round_tables' && mode!=='participants'){
    renderRoundTables(layout,groups,mode); $('#participantCount').textContent=`${participants.size}人`; return;
  }
  if(mode==='participants'){
    seatGrid.style.gridTemplateColumns='repeat(auto-fit,minmax(180px,1fr))';seatGrid.style.gridTemplateRows='none';
    for(const p of participants.values()) seatGrid.appendChild(makeTile(p,Number(p.seat_no),groups.get(Number(p.seat_no))?.length||1));
  }else{
    seatGrid.style.gridTemplateColumns=`repeat(${layout.cols},minmax(0,1fr))`;seatGrid.style.gridTemplateRows=`repeat(${layout.rows},minmax(${mode==='compact'?'18px':'0'},1fr))`;
    for(let r=0;r<layout.rows;r++)for(let c=0;c<layout.cols;c++){
      const n=layout.seat_map[r][c];const cell=document.createElement('div');
      if((layout.vertical_aisles||[]).includes(c+1))cell.classList.add('aisle-v'); if((layout.horizontal_aisles||[]).includes(r+1))cell.classList.add('aisle-h');
      if(n==null){cell.classList.add('seat-tile','disabled');seatGrid.appendChild(cell);continue;}
      const ps=groups.get(Number(n))||[];
      if(!ps.length){cell.classList.add('seat-tile','empty');if(mode==='compact')cell.classList.add('compact-empty');cell.innerHTML=`<span class="empty-seat-no">${String(n).padStart(2,'0')}</span>`;seatGrid.appendChild(cell);continue;}
      const tile=makeTile(ps[0],n,ps.length);cell.replaceWith(tile);if((layout.vertical_aisles||[]).includes(c+1))tile.classList.add('aisle-v');if((layout.horizontal_aisles||[]).includes(r+1))tile.classList.add('aisle-h');seatGrid.appendChild(tile);
    }
  }
  $('#participantCount').textContent=`${participants.size}人`;
}
function renderRoundTables(layout,groups,mode){
  seatGrid.classList.add('round-table-grid');
  seatGrid.style.gridTemplateColumns=`repeat(${layout.table_cols||3},minmax(250px,1fr))`;
  seatGrid.style.gridTemplateRows=`repeat(${layout.table_rows||2},minmax(220px,1fr))`;
  const tables=[...(layout.tables||[])].sort((a,b)=>a.row-b.row||a.col-b.col);
  for(const tb of tables){
    const unit=document.createElement('div');unit.className='round-table-unit';
    const positions=['table-seat-left','table-seat-top','table-seat-right'];
    (tb.seats||[]).forEach((n,i)=>{
      const ps=groups.get(Number(n))||[];
      let el;
      if(ps.length) el=makeTile(ps[0],n,ps.length);
      else {el=document.createElement('div');el.className='seat-tile empty';el.innerHTML=`<span class="empty-seat-no">${String(n).padStart(2,'0')}</span>`;}
      el.classList.add(positions[i]); unit.appendChild(el);
    });
    const table=document.createElement('div');table.className='round-table';table.innerHTML=`<span>卓${tb.table}</span>`;unit.appendChild(table);
    seatGrid.appendChild(unit);
  }
}

function makeTile(p,seatNo,dupCount=1){
 const tile=document.createElement('div');tile.className=`seat-tile occupied${dupCount>1?' duplicate':''}`;tile.dataset.seat=seatNo;
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.dataset.pid=p.participant_id;const st=peers.get(p.participant_id)?.studentStream;if(st)video.srcObject=st;if(!demoMode)tile.appendChild(video);else{const d=document.createElement('div');d.className='demo-screen';tile.appendChild(d);}
 const top=document.createElement('div');top.className='tile-top';let bits=[];if(labelPrefs.seat)bits.push(`<span class="label-chip seat-chip seat-edit" title="クリックして座席番号を修正">${String(seatNo).padStart(2,'0')}</span>`);if(labelPrefs.student_id)bits.push(`<span class="label-chip">${esc(p.student_id||'')}</span>`);top.innerHTML=`<div style="display:flex;gap:3px;min-width:0">${bits.join('')}</div>`;tile.appendChild(top);
 let name=[];if(labelPrefs.surname)name.push(p.surname||'');if(labelPrefs.given_name)name.push(p.given_name||'');if(name.join('')){const b=document.createElement('div');b.className='tile-bottom';b.innerHTML=`<span class="label-chip">${esc(name.join(' '))}</span>`;tile.appendChild(b);}
 if(labelPrefs.joined_at){const j=document.createElement('span');j.className='label-chip';j.style.position='absolute';j.style.left='4px';j.style.bottom='28px';j.textContent=formatTime(p.joined_at);tile.appendChild(j)}
 const badges=document.createElement('div');badges.className='state-badges';if(dupCount>1)badges.innerHTML+=`<span class="badge warn">${String(seatNo).padStart(2,'0')} ×${dupCount}</span>`;if(p.hand)badges.innerHTML+='<span class="badge hand">🙋</span>';if(p.answer==='yes')badges.innerHTML+='<span class="badge yes">Yes</span>';if(p.answer==='no')badges.innerHTML+='<span class="badge no">No</span>';if(p.device_type==='tablet')badges.innerHTML+=`<span class="badge">${esc(p.device_label||'Tablet')}</span>`;if(p.sharing===false&&p.connected)badges.innerHTML+=`<span class="badge ${p.share_capability==='external'?'warn':'danger'}">${p.share_capability==='external'?'外部共有待機':'共有停止'}</span>`;if(labelPrefs.connected)badges.innerHTML+=`<span class="badge">${p.connected?'接続中':'切断'}</span>`;tile.appendChild(badges);
 tile.addEventListener('click',e=>{if(e.target.closest('.seat-edit')){e.stopPropagation();editSeat(p);return;}focusParticipant(p.participant_id)});return tile;
}
async function editSeat(p){const v=prompt(`${p.student_id} ${p.surname||''} ${p.given_name||''}\n新しい座席番号`,String(p.seat_no));if(v==null)return;const n=Number(v);try{await api(`/api/session/${session.session_id}/participant/${p.participant_id}/seat`,{method:'POST',body:JSON.stringify({teacher_token:teacherToken,seat_no:n})});p.seat_no=n;renderGrid();}catch(e){toast(`変更できません: ${e.message}`,5000)}}

function formatTime(ts){ if(!ts) return ''; const d=new Date(ts*1000); return d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

function focusParticipant(pid){
  const p=participants.get(pid); if(!p)return;
  if(focusedPid && focusedPid!==pid) sendWs({type:'quality',target:focusedPid,mode:'thumb'});
  focusedPid=pid;
  focusVideo.srcObject=peers.get(pid)?.studentStream||null;
  if(demoMode){ focusVideo.style.background='linear-gradient(150deg,#fafafa 0 62%,#cdd5e3 62%)'; }
  const focusParts=[];
  if(labelPrefs.seat) focusParts.push(String(p.seat_no));
  if(labelPrefs.student_id && p.student_id) focusParts.push(p.student_id);
  if(labelPrefs.surname||labelPrefs.given_name) focusParts.push([labelPrefs.surname?p.surname:'',labelPrefs.given_name?p.given_name:''].filter(Boolean).join(' '));
  $('#focusLabel').textContent = focusParts.join('　');
  const incoming=$('#focusIncoming');
  incoming.textContent=p.last_message ? `学生から: ${p.last_message}` : '';
  incoming.classList.toggle('hidden',!p.last_message);
  focusOverlay.classList.remove('hidden');
  sendWs({type:'quality',target:pid,mode:'focus'});
}
function closeFocus(){
  if(focusedPid) sendWs({type:'quality',target:focusedPid,mode:'thumb'});
  focusedPid=null; focusVideo.srcObject=null; focusOverlay.classList.add('hidden');
}

function makePeer(pid){
  const old=peers.get(pid);
  if(old && !['closed','failed'].includes(old.pc.connectionState)) return old;
  const lastStream=old?.studentStream||null;
  if(old){ try{old.pc.close();}catch{} peers.delete(pid); }
  const pc=new RTCPeerConnection({iceServers});
  const state={pc,teacherSender:null,studentStream:lastStream}; peers.set(pid,state);
  if(teacherDisplayTrack){ state.teacherSender=pc.addTrack(teacherDisplayTrack, teacherDisplayStream); }
  pc.onicecandidate=e=>{ if(e.candidate) sendWs({type:'signal',target:pid,data:{candidate:e.candidate}}); };
  pc.ontrack=e=>{
    const stream=e.streams[0] || new MediaStream([e.track]);
    state.studentStream=stream;
    const video=document.querySelector(`video[data-pid="${CSS.escape(pid)}"]`);
    if(video) video.srcObject=stream;
    if(focusedPid===pid) focusVideo.srcObject=stream;
  };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected') armLiveness(pid,Date.now()/1000);
    else if(pc.connectionState==='failed') markLoss(pid,Date.now()/1000);
  };
  return state;
}

async function handleSignal(pid,data){
  const state=makePeer(pid), pc=state.pc;
  try{
    if(data.description){
      const d=data.description;
      if(d.type==='offer'){
        if(pc.signalingState!=='stable'){ try{await pc.setLocalDescription({type:'rollback'});}catch{} }
        await pc.setRemoteDescription(d);
        const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
        sendWs({type:'signal',target:pid,data:{description:pc.localDescription}});
      }else if(d.type==='answer' && pc.signalingState==='have-local-offer'){
        await pc.setRemoteDescription(d);
      }
    } else if(data.candidate){
      try{ await pc.addIceCandidate(data.candidate); }catch{}
    }
  }catch(e){ console.warn('signal error',pid,e); }
}

async function negotiateTeacherOffer(pid){
  const state=peers.get(pid); if(!state)return;
  const pc=state.pc;
  if(pc.signalingState!=='stable') return;
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  sendWs({type:'signal',target:pid,data:{description:pc.localDescription}});
}

async function startTeacherShare(){
  if(!navigator.mediaDevices?.getDisplayMedia){ toast('このブラウザは画面共有に対応していません',5000); return; }
  try{
    teacherDisplayStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:12,max:15},width:{ideal:1280},height:{ideal:720}},audio:false});
    teacherDisplayTrack=teacherDisplayStream.getVideoTracks()[0];
    teacherDisplayTrack.contentHint='detail';
    teacherDisplayTrack.addEventListener('ended',()=>stopTeacherShare());
    for(const [pid,state] of peers){
      if(!state.teacherSender) state.teacherSender=state.pc.addTrack(teacherDisplayTrack, teacherDisplayStream);
      await negotiateTeacherOffer(pid);
    }
    sendWs({type:'teacher_share_state',active:true});
    $('#shareTeacherBtn').textContent='教師共有を終了';
  }catch(e){ if(e.name!=='NotAllowedError') toast(`共有できません: ${e.message}`,5000); }
}

async function stopTeacherShare(){
  if(!teacherDisplayTrack && !teacherDisplayStream) return;
  const track=teacherDisplayTrack; teacherDisplayTrack=null;
  if(track && track.readyState!=='ended') track.stop();
  teacherDisplayStream?.getTracks().forEach(t=>{ if(t.readyState!=='ended')t.stop(); });
  teacherDisplayStream=null;
  for(const [pid,state] of peers){
    if(state.teacherSender){ try{state.pc.removeTrack(state.teacherSender);}catch{} state.teacherSender=null; }
    await negotiateTeacherOffer(pid);
  }
  sendWs({type:'teacher_share_state',active:false});
  $('#shareTeacherBtn').textContent='教師画面共有';
}

function showJoinInfo(){
  if(!session)return;
  const joinUrl=session.join_url || `${location.origin}/class/${session.class_code}`;
  const m=showModal(`<h2>参加URL</h2><div class="field"><label>学生用URL</label><div class="row"><input id="joinUrlField" value="${esc(joinUrl)}" readonly><button class="icon-btn" id="copyJoinUrl">コピー</button></div></div><details><summary>QRコードを表示</summary><img class="qr-img" alt="学生参加QR" src="/api/qr?value=${encodeURIComponent(joinUrl)}"></details><div class="field"><label>教師復旧コード</label><div class="code-box">${esc(session.recovery_code||'')}</div></div><div class="row end"><button class="icon-btn" id="modalClose">閉じる</button></div>`);
  m.querySelector('#copyJoinUrl').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(joinUrl);toast('参加URLをコピーしました')}catch{m.querySelector('#joinUrlField').select();document.execCommand('copy');toast('参加URLをコピーしました')}});
  m.querySelector('#modalClose').addEventListener('click',closeModal);
}

function showLabels(){
 const keys=[['seat','座席番号'],['student_id','学籍番号'],['surname','姓'],['given_name','名'],['joined_at','入室時刻'],['connected','接続状態']];
 const m=showModal(`<h2>学生画面の表示</h2><div class="check-grid">${keys.map(([k,l])=>`<label><input data-k="${k}" type="checkbox" ${labelPrefs[k]?'checked':''}> ${l}</label>`).join('')}</div><div class="row end" style="margin-top:18px"><button class="icon-btn primary" id="saveLabels">保存</button></div>`);
 m.querySelector('#saveLabels').onclick=async()=>{for(const x of m.querySelectorAll('[data-k]'))labelPrefs[x.dataset.k]=x.checked;try{if(session.class_code)await api(`/api/class/${session.class_code}`,{method:'POST',body:JSON.stringify({display_settings:labelPrefs})});renderGrid();closeModal()}catch(e){toast(e.message)}};
}
function showLayout(){
 const current=JSON.parse(JSON.stringify(session.layout));
 const isTable=current.type==='round_tables';
 const m=showModal(`<h2>座席レイアウト設定</h2>
 <div class="field"><label>レイアウト形式</label><select id="layoutType"><option value="classroom">通常教室型</option><option value="round_tables">丸テーブル型（3人掛け）</option></select></div>
 <div id="normalSettings"><div class="row"><div class="field"><label>縦</label><input id="lr" type="number" min="1" max="12" value="${isTable?8:current.rows}"></div><div class="field"><label>横</label><input id="lc" type="number" min="1" max="12" value="${isTable?6:current.cols}"></div></div><div class="row"><div class="field"><label>採番</label><select id="ln"><option value="vertical">縦方向</option><option value="horizontal">横方向</option></select></div><div class="field"><label>開始</label><select id="ls"><option value="left">左</option><option value="right">右</option></select></div></div><p class="muted">座席をクリック＝使用可/不可。列間・段間に通路を設定できます（最大各11）。</p><div id="aisles"></div><div id="layoutPreview" class="layout-preview"></div></div>
 <div id="tableSettings"><div class="row"><div class="field"><label>テーブル縦</label><input id="tr" type="number" min="1" max="12" value="${isTable?current.table_rows||2:2}"></div><div class="field"><label>テーブル横</label><input id="tc" type="number" min="1" max="12" value="${isTable?current.table_cols||3:3}"></div></div><p class="muted">1卓3席。標準プリセットは2段×3卓＝6卓・18席です。各卓は左下→上→右下の順に採番します。</p><div id="tablePreview" class="table-layout-preview"></div><button id="preset18" class="icon-btn">18席（2×3卓）に戻す</button></div>
 <div class="row end"><button id="resetLayout" class="icon-btn">通常教室デフォルトに戻す</button><button id="layoutCancel" class="icon-btn">閉じる</button><button id="layoutSave" class="icon-btn primary">保存</button></div>`);
 const type=m.querySelector('#layoutType');type.value=isTable?'round_tables':'classroom';
 const L=isTable?{rows:8,cols:6,numbering:'vertical',start_side:'left',disabled_positions:[],vertical_aisles:[2,4],horizontal_aisles:[]}:current;
 m.querySelector('#ln').value=L.numbering||'vertical';m.querySelector('#ls').value=L.start_side||'left';
 let disabled=new Set((L.disabled_positions||[]).map(x=>x.join(','))),va=new Set(L.vertical_aisles||[]),ha=new Set(L.horizontal_aisles||[]);
 const rebuildNormal=()=>{L.rows=Math.max(1,Math.min(12,+m.querySelector('#lr').value||8));L.cols=Math.max(1,Math.min(12,+m.querySelector('#lc').value||6));L.numbering=m.querySelector('#ln').value;L.start_side=m.querySelector('#ls').value;const a=m.querySelector('#aisles');a.innerHTML=`<div class="row" style="flex-wrap:wrap">縦通路: ${Array.from({length:L.cols-1},(_,i)=>`<button class="icon-btn aisleV" data-n="${i+1}">${va.has(i+1)?'✓ ':''}${i+1}</button>`).join('')}</div><div class="row" style="flex-wrap:wrap">横通路: ${Array.from({length:L.rows-1},(_,i)=>`<button class="icon-btn aisleH" data-n="${i+1}">${ha.has(i+1)?'✓ ':''}${i+1}</button>`).join('')}</div>`;a.querySelectorAll('.aisleV').forEach(b=>b.onclick=()=>{let n=+b.dataset.n;va.has(n)?va.delete(n):va.add(n);rebuildNormal()});a.querySelectorAll('.aisleH').forEach(b=>b.onclick=()=>{let n=+b.dataset.n;ha.has(n)?ha.delete(n):ha.add(n);rebuildNormal()});const pr=m.querySelector('#layoutPreview');pr.style.gridTemplateColumns=`repeat(${L.cols},1fr)`;pr.innerHTML='';for(let r=0;r<L.rows;r++)for(let c=0;c<L.cols;c++){let k=`${r},${c}`,b=document.createElement('button');b.className='layout-seat'+(disabled.has(k)?' off':'');b.textContent=disabled.has(k)?'×':'●';b.onclick=()=>{disabled.has(k)?disabled.delete(k):disabled.add(k);rebuildNormal()};pr.appendChild(b)}};
 const rebuildTables=()=>{const rr=Math.max(1,Math.min(12,+m.querySelector('#tr').value||2)),cc=Math.max(1,Math.min(12,+m.querySelector('#tc').value||3));const pr=m.querySelector('#tablePreview');pr.style.gridTemplateColumns=`repeat(${cc},1fr)`;pr.innerHTML='';let n=1;for(let visualRow=rr-1;visualRow>=0;visualRow--)for(let c=0;c<cc;c++){const u=document.createElement('div');u.className='mini-round-unit';u.innerHTML=`<span class="mini-seat left">${String(n).padStart(2,'0')}</span><span class="mini-seat top">${String(n+1).padStart(2,'0')}</span><span class="mini-table">○</span><span class="mini-seat right">${String(n+2).padStart(2,'0')}</span>`;n+=3;pr.appendChild(u)}};
 const switchType=()=>{const tbl=type.value==='round_tables';m.querySelector('#normalSettings').classList.toggle('hidden',tbl);m.querySelector('#tableSettings').classList.toggle('hidden',!tbl);if(tbl)rebuildTables();else rebuildNormal()};
 ['#lr','#lc','#ln','#ls'].forEach(q=>m.querySelector(q).onchange=rebuildNormal);['#tr','#tc'].forEach(q=>m.querySelector(q).onchange=rebuildTables);type.onchange=switchType;
 m.querySelector('#preset18').onclick=()=>{m.querySelector('#tr').value=2;m.querySelector('#tc').value=3;rebuildTables()};switchType();
 m.querySelector('#layoutCancel').onclick=closeModal;
 m.querySelector('#resetLayout').onclick=async()=>{try{const c=await api(`/api/class/${session.class_code}/reset-layout`,{method:'POST',body:'{}'});session.layout=c.layout;renderGrid();closeModal()}catch(e){toast(e.message,5000)}};
 m.querySelector('#layoutSave').onclick=async()=>{try{let layout;if(type.value==='round_tables')layout={type:'round_tables',table_rows:+m.querySelector('#tr').value||2,table_cols:+m.querySelector('#tc').value||3};else layout={type:'classroom',rows:L.rows,cols:L.cols,numbering:L.numbering,start_side:L.start_side,disabled_positions:[...disabled].map(x=>x.split(',').map(Number)),vertical_aisles:[...va],horizontal_aisles:[...ha]};const c=await api(`/api/class/${session.class_code}`,{method:'POST',body:JSON.stringify({layout})});session.layout=c.layout;renderGrid();closeModal()}catch(e){toast(`変更できません: ${e.message}`,5000)}};
}

function showMessageAll(){
  const m=showModal(`<h2>全員へ短信</h2><div class="field"><label>メッセージ</label><input id="allMsg" maxlength="300" placeholder="短い指示"></div><div class="row end"><button class="icon-btn" id="cancel">閉じる</button><button class="icon-btn primary" id="send">送信</button></div>`);
  m.querySelector('#cancel').addEventListener('click',closeModal);
  m.querySelector('#send').addEventListener('click',()=>{const text=m.querySelector('#allMsg').value.trim();if(text){sendWs({type:'teacher_message',target:'all',text});toast('全員へ送信しました');}closeModal();});
  m.querySelector('#allMsg').focus();
}

function safeFile(s){return String(s).normalize('NFKC').replace(/[\\/:*?"<>|\s]+/g,'_').replace(/^_+|_+$/g,'')||'A10'}
function snapshotPNG(){
 const L=session.layout;
 if(L.type==='round_tables'){snapshotRoundTablesPNG();return;}
 const scale=2,cw=240,ch=150,gap=12,aisle=36,head=90;let W=L.cols*cw+(L.cols-1)*gap+(L.vertical_aisles||[]).length*aisle,H=L.rows*ch+(L.rows-1)*gap+(L.horizontal_aisles||[]).length*aisle+head;const cv=document.createElement('canvas');cv.width=W*scale;cv.height=H*scale;const x=cv.getContext('2d');x.scale(scale,scale);x.fillStyle='#f4f4f6';x.fillRect(0,0,W,H);x.fillStyle='#111';x.font='600 24px sans-serif';x.fillText(session.title||'授業',16,30);const d=new Date();const stamp=d.toLocaleString('sv-SE').replace('T',' ');x.font='16px sans-serif';x.fillText(stamp,16,58);
 const by=new Map();for(const p of participants.values()){if(!by.has(+p.seat_no))by.set(+p.seat_no,[]);by.get(+p.seat_no).push(p)};let yy=head;for(let r=0;r<L.rows;r++){let xx=0;for(let c=0;c<L.cols;c++){const n=L.seat_map[r][c];x.fillStyle=n==null?'#dedee3':'#fff';x.fillRect(xx,yy,cw,ch);x.strokeStyle='#c9c9cf';x.strokeRect(xx,yy,cw,ch);if(n!=null){const ps=by.get(+n)||[];const p=ps[0];if(p){const v=document.querySelector(`video[data-pid="${CSS.escape(p.participant_id)}"]`);if(v&&v.videoWidth)try{x.drawImage(v,xx,yy,cw,ch)}catch{};x.fillStyle='rgba(0,0,0,.72)';x.fillRect(xx,yy+ch-28,cw,28);x.fillStyle='#fff';x.font='14px sans-serif';x.fillText(`${String(n).padStart(2,'0')} ${p.student_id||''} ${p.surname||''} ${p.given_name||''}${ps.length>1?' ×'+ps.length:''}`,xx+6,yy+ch-9)}else{x.fillStyle='#999';x.font='13px sans-serif';x.fillText(String(n).padStart(2,'0'),xx+6,yy+ch-8)}}xx+=cw+gap+((L.vertical_aisles||[]).includes(c+1)?aisle:0)}yy+=ch+gap+((L.horizontal_aisles||[]).includes(r+1)?aisle:0)}
 const a=document.createElement('a');const pad=n=>String(n).padStart(2,'0');const fn=`${safeFile(session.title)}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;a.download=fn;a.href=cv.toDataURL('image/png');a.click();toast('座席全体PNGを保存しました');
}
function snapshotRoundTablesPNG(){
 const L=session.layout,scale=2,uw=360,uh=260,gap=28,head=90,W=(L.table_cols||3)*uw+((L.table_cols||3)-1)*gap,H=(L.table_rows||2)*uh+((L.table_rows||2)-1)*gap+head;
 const cv=document.createElement('canvas');cv.width=W*scale;cv.height=H*scale;const x=cv.getContext('2d');x.scale(scale,scale);x.fillStyle='#f4f4f6';x.fillRect(0,0,W,H);
 const d=new Date(),stamp=d.toLocaleString('sv-SE').replace('T',' ');x.fillStyle='#111';x.font='600 24px sans-serif';x.fillText(session.title||'授業',16,30);x.font='16px sans-serif';x.fillText(stamp,16,58);
 const by=new Map();for(const p of participants.values()){if(!by.has(+p.seat_no))by.set(+p.seat_no,[]);by.get(+p.seat_no).push(p)}
 const tables=[...(L.tables||[])].sort((a,b)=>a.row-b.row||a.col-b.col);
 for(const tb of tables){const ox=tb.col*(uw+gap),oy=head+tb.row*(uh+gap);x.strokeStyle='#d2d3d8';x.setLineDash([5,5]);x.strokeRect(ox,oy,uw,uh);x.setLineDash([]);x.fillStyle='#e5e6ea';x.beginPath();x.arc(ox+uw/2,oy+uh/2,42,0,Math.PI*2);x.fill();x.fillStyle='#666';x.font='14px sans-serif';x.fillText(`卓${tb.table}`,ox+uw/2-14,oy+uh/2+5);
  const spots=[[ox+15,oy+uh-100],[ox+uw/2-65,oy+12],[ox+uw-145,oy+uh-100]];
  tb.seats.forEach((n,i)=>{const [sx,sy]=spots[i],sw=130,sh=82,ps=by.get(+n)||[],p=ps[0];x.fillStyle='#fff';x.fillRect(sx,sy,sw,sh);x.strokeStyle='#bbb';x.strokeRect(sx,sy,sw,sh);if(p){const v=document.querySelector(`video[data-pid="${CSS.escape(p.participant_id)}"]`);if(v&&v.videoWidth)try{x.drawImage(v,sx,sy,sw,sh)}catch{};x.fillStyle='rgba(0,0,0,.7)';x.fillRect(sx,sy+sh-22,sw,22);x.fillStyle='#fff';x.font='12px sans-serif';x.fillText(`${String(n).padStart(2,'0')} ${p.surname||''}${ps.length>1?' ×'+ps.length:''}`,sx+4,sy+sh-6)}else{x.fillStyle='#888';x.font='13px sans-serif';x.fillText(String(n).padStart(2,'0'),sx+5,sy+sh-7)}})}
 const a=document.createElement('a'),pad=n=>String(n).padStart(2,'0');a.download=`${safeFile(session.title)}_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;a.href=cv.toDataURL('image/png');a.click();toast('座席全体PNGを保存しました');
}

function downloadCSV(){location.href=`/api/session/${session.session_id}/csv?token=${encodeURIComponent(teacherToken)}`}

async function endClass(){
  const m=showModal(`<h2>授業を終了しますか</h2><p>学生用URLと教師復旧コードは無効になります。</p><div class="row end"><button class="icon-btn" id="cancel">戻る</button><button class="icon-btn danger" id="end">授業終了</button></div>`);
  m.querySelector('#cancel').addEventListener('click',closeModal);
  m.querySelector('#end').addEventListener('click',async()=>{ try{ if(!demoMode) await api(`/api/session/${session.session_id}/end`,{method:'POST',body:JSON.stringify({teacher_token:teacherToken})}); clearActive(); location.href='/'; }catch(e){toast(e.message,5000);} });
}

function toggleMenu(force){
  const bar=$('#bottomBar');
  const open=force ?? bar.classList.contains('collapsed');
  bar.classList.toggle('collapsed',!open); $('#menuHandle').textContent=open?'⌄':'⌃';
  clearTimeout(menuTimer); if(open) menuTimer=setTimeout(()=>toggleMenu(false),5000);
}

function applyOrientation(){
  teacherApp.classList.toggle('rear-view',rearView);
  const b=$('#orientationBtn');if(b)b.textContent=rearView?'教卓側':'教室後方側';
}
function toggleOrientation(){rearView=!rearView;localStorage.setItem('classroom_view_orientation',rearView?'rear':'front');applyOrientation();}
function updateClock(){const d=new Date();const el=$('#classClock');if(el)el.textContent=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function backupData(){location.href='/api/backup';}
function showBackup(){const m=showModal(`<h2>バックアップ</h2><p>授業設定・座席設定・セッション記録をJSONで保存／復元します。</p><div class="row"><button class="icon-btn primary" id="backupExport">エクスポート</button><label class="icon-btn" for="backupImport">インポート</label><input id="backupImport" type="file" accept="application/json,.json" hidden></div><div class="row end"><button class="icon-btn" id="backupClose">閉じる</button></div>`);m.querySelector('#backupExport').onclick=backupData;m.querySelector('#backupClose').onclick=closeModal;m.querySelector('#backupImport').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());await api('/api/backup/import',{method:'POST',body:JSON.stringify(data)});toast('バックアップを復元しました');closeModal();setTimeout(()=>location.reload(),600)}catch(err){toast(`復元できません: ${err.message}`,5000)}};}

function setupEvents(){
  $('#startClass').addEventListener('click',startNewSession);
  $('#recoverClass').addEventListener('click',recoverByCode);
  $('#menuHandle').addEventListener('click',()=>toggleMenu());
  $('#bottomBar').addEventListener('pointerenter',()=>clearTimeout(menuTimer));
  $('#bottomBar').addEventListener('pointerleave',()=>{clearTimeout(menuTimer);menuTimer=setTimeout(()=>toggleMenu(false),1800);});
  $('#joinInfoBtn').addEventListener('click',showJoinInfo);
  $('#layoutBtn').addEventListener('click',showLayout);
  $('#orientationBtn').addEventListener('click',toggleOrientation);
  $('#viewMode').addEventListener('change',renderGrid);
  $('#snapshotBtn').addEventListener('click',snapshotPNG);
  $('#csvBtn').addEventListener('click',downloadCSV);
  $('#backupBtn').addEventListener('click',showBackup);
  $('#labelsBtn').addEventListener('click',showLabels);
  $('#messageAllBtn').addEventListener('click',showMessageAll);
  $('#resetAnswersBtn').addEventListener('click',()=>{sendWs({type:'reset_answers'});for(const p of participants.values())p.answer='';renderGrid();});
  $('#shareTeacherBtn').addEventListener('click',()=>teacherDisplayTrack?stopTeacherShare():startTeacherShare());
  $('#endClassBtn').addEventListener('click',endClass);
  $('#focusBack').addEventListener('click',closeFocus);
  $('#focusSend').addEventListener('click',()=>{const t=$('#focusMessage').value.trim();if(t&&focusedPid){sendWs({type:'teacher_message',target:focusedPid,text:t});toast('送信しました');$('#focusMessage').value='';}});
  $('#focusMessage').addEventListener('keydown',e=>{if(e.key==='Enter')$('#focusSend').click();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!focusOverlay.classList.contains('hidden'))closeFocus();});
}

function launchDemo(){
  launch.classList.add('hidden'); teacherApp.classList.remove('hidden');
  session={session_id:'DEMO',class_code:'DEMO',title:'Classroom View デモ',layout:{rows:8,cols:6,vertical_aisles:[2,4],horizontal_aisles:[],seat_map:[[null,null,22,30,38,null],[7,14,21,29,37,45],[6,13,20,28,36,44],[5,12,19,27,35,43],[4,11,18,26,34,42],[3,10,17,25,33,41],[2,9,16,24,32,40],[1,8,15,23,31,39]]},participants:[],recovery_code:'DEMO-DEMO-DEMO'};
  const names=['サトウ ハナコ','スズキ タロウ','タカハシ ミナ','タナカ ケン','イトウ アヤ','ヤマモト ユウ','ナカムラ サキ','コバヤシ リョウ','カトウ ミキ','ヨシダ シュン','ヤマダ レイ','ササキ ナオ','ヤマグチ コウ','マツモト ユイ','イノウエ リナ','キムラ ハル'];
  for(let i=1;i<=40;i++) participants.set(`demo${i}`,{participant_id:`demo${i}`,seat_no:i,student_id:`A123${String(i).padStart(4,'0')}`,surname:names[(i-1)%names.length].split(' ')[0],given_name:names[(i-1)%names.length].split(' ')[1],connected:true,hand:i===7,answer:i===11?'yes':i===14?'no':'',last_message:i===19?'わかりません':''});
  $('#className').textContent=session.title;$('#deskClassName').textContent=session.title;applyOrientation();renderGrid();
}

await initConfig(); setupEvents(); applyOrientation(); updateClock(); setInterval(updateClock,1000);
const saved = JSON.parse(localStorage.getItem('a10_teacher_active') || 'null');
if(saved){ $('#resumeHint').classList.remove('hidden'); $('#resumeHint').textContent=`進行中の授業「${saved.title||''}」があります。`; }
if(demoMode) launchDemo(); else if(saved) resumeSaved(); else loadClasses();
