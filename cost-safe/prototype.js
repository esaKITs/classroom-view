const $=s=>document.querySelector(s);
let pc=null, stream=null;
const status=t=>$('#status').textContent=t;
function makePc(){
 if(pc) return pc;
 pc=new RTCPeerConnection({iceServers:[]});
 pc.onicecandidate=e=>{if(!e.candidate && pc.localDescription) $('#local').value=JSON.stringify(pc.localDescription);};
 pc.onconnectionstatechange=()=>status('Peer connection: '+pc.connectionState);
 pc.ontrack=e=>{$('#video').srcObject=e.streams[0]||new MediaStream([e.track]);};
 return pc;
}
async function waitIce(){
 if(pc.iceGatheringState==='complete') return;
 await new Promise(resolve=>{const f=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',f);resolve();}};pc.addEventListener('icegatheringstatechange',f);setTimeout(resolve,5000);});
 $('#local').value=JSON.stringify(pc.localDescription);
}
$('#start').onclick=()=>{makePc();status('Peer created. ICE servers: none.');};
$('#capture').onclick=async()=>{
 try{stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const p=makePc();for(const t of stream.getTracks())p.addTrack(t,stream);$('#video').srcObject=stream;status('Screen capture ready.');}
 catch(e){status('Capture failed: '+e.message);}
};
$('#offer').onclick=async()=>{const p=makePc();await p.setLocalDescription(await p.createOffer());await waitIce();status('Offer ready. Copy Local packet to student.');};
$('#apply').onclick=async()=>{try{const d=JSON.parse($('#remote').value);const p=makePc();await p.setRemoteDescription(d);status('Remote '+d.type+' applied.');}catch(e){status('Apply failed: '+e.message);}};
$('#answer').onclick=async()=>{try{const p=makePc();await p.setLocalDescription(await p.createAnswer());await waitIce();status('Answer ready. Copy Local packet to teacher.');}catch(e){status('Answer failed: '+e.message);}};
