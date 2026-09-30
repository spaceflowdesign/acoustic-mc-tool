// Local-only evidence: no filename, user agent or error is uploaded automatically.
const inputEvents=[],pickerFlights=new Map();
function recordInput(side,event,details={}){
  inputEvents.push({at:new Date().toISOString(),side,event,...details});if(inputEvents.length>40)inputEvents.shift();
  if($('inputLog'))$('inputLog').value=JSON.stringify({build:'2026-09-30-remux-audit-v4',userAgent:navigator.userAgent,events:inputEvents},null,2);
}
async function readMediaBytes(blob){
  try{return await blob.arrayBuffer();}catch(first){
    // Some provider-backed Files fail through one reader. Retry the same bytes,
    // never a second simultaneous decoder or a full duplicate video buffer.
    recordInput('FILE','ArrayBuffer失敗・FileReader再試行',{error:first.name+': '+first.message,size:blob.size});
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||first);reader.onabort=()=>reject(Error('ファイル読出しが中断されました'));reader.readAsArrayBuffer(blob);});
  }
}
function receivePickedFile(side,event){
  const input=event.target,file=input.files?.[0];recordInput(side,'picker '+(event.type||'change'),{count:input.files?.length||0,name:file?.name,type:file?.type,size:file?.size,lastModified:file?.lastModified,kind:file?.constructor?.name});
  if(pickerFlights.has(input))return pickerFlights.get(input);if(!file)return Promise.resolve();
  // Defer execution one microtask so input+change events share the same flight.
  const task=Promise.resolve().then(async()=>{try{if(slots[side]&&!confirm(side+'の音声を置き換えますか？'))return;await loadBlob(side,file,file.name||'選択したファイル');}finally{input.value='';pickerFlights.delete(input);}});
  pickerFlights.set(input,task);return task;
}
const diagnosticsInit=initWorkspace;
initWorkspace=function(){diagnosticsInit();
  const details=element('details',{},'<summary>入力診断（端末内のみ）</summary><p>ファイル名を含みます。共有前に確認してください。読込失敗後の抽出音声を、Web Audioとは別のaudio要素で診断できます。テスト時はA/B再生を停止します。保存したM4Aには元の音声が含まれます。自動送信はしません。</p><textarea id="inputLog" rows="8" readonly aria-label="入力診断ログ"></textarea>');
  details.append(makeAction('抽出音声をテスト再生（診断）',startRemuxAudioProbe,{id:'remuxProbe',disabled:true}),makeAction('抽出M4Aを保存（診断）',downloadRemuxDiagnostic,{id:'remuxSave',disabled:true}),makeAction('診断音声を解放',clearRemuxDiagnostic,{id:'remuxRelease',disabled:true}),element('p',{id:'remuxProbeStatus',role:'status'}),element('audio',{id:'remuxProbeAudio',preload:'none',hidden:true}));
  $('sourceDialog').querySelector('.dialog-body').append(details);recordInput('-','準備');
  $('sourceDialog').addEventListener('close',()=>stopRemuxAudioProbe('dialog closed'));details.addEventListener('toggle',()=>{if(!details.open)stopRemuxAudioProbe('details closed');});document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRemuxAudioProbe('background');});window.addEventListener('pagehide',()=>stopRemuxAudioProbe('pagehide'));
  for(const side of ['A','B']){const input=$('file'+side);input.onchange=e=>receivePickedFile(side,e);input.oninput=e=>receivePickedFile(side,e);input.addEventListener('click',()=>recordInput(side,'pickerを開く'));input.addEventListener('cancel',()=>recordInput(side,'pickerキャンセル'));}
};

// Hold ONE failed compressed audio Blob (slices), never original video/PCM.
// No automatic probe, parallel native decode, WebCodecs or playback fallback.
const remuxDiagnostic={blob:null,side:null,url:null,timer:null,cleanup:null,token:0};
function stopRemuxAudioProbe(reason='stopped'){
  const d=remuxDiagnostic;d.token++;clearTimeout(d.timer);d.timer=null;d.cleanup?.();d.cleanup=null;const audio=$('remuxProbeAudio');if(audio&&audio.getAttribute('src')){audio.pause();audio.removeAttribute('src');audio.hidden=true;audio.load();}if(d.url)URL.revokeObjectURL(d.url);d.url=null;
  if($('remuxProbe'))$('remuxProbe').disabled=!d.blob;if($('remuxProbeStatus')&&d.blob)$('remuxProbeStatus').textContent='診断停止：'+reason;
}
function clearRemuxDiagnostic(){stopRemuxAudioProbe('released');remuxDiagnostic.blob=null;remuxDiagnostic.side=null;for(const id of ['remuxProbe','remuxSave','remuxRelease'])if($(id))$(id).disabled=true;if($('remuxProbeStatus'))$('remuxProbeStatus').textContent='';}
function holdRemuxDiagnostic(blob,side){clearRemuxDiagnostic();remuxDiagnostic.blob=blob;remuxDiagnostic.side=side;for(const id of ['remuxProbe','remuxSave','remuxRelease'])$(id).disabled=false;$('remuxProbeStatus').textContent='抽出音声を1件保持。テスト再生ボタンを押すと診断します。';recordInput(side,'remux診断待機',{blobSize:blob.size,mimeType:blob.type,automaticPlayback:false});}
function downloadRemuxDiagnostic(){const d=remuxDiagnostic;if(!d.blob)return;if(!d.url)d.url=URL.createObjectURL(d.blob);const a=document.createElement('a');a.href=d.url;a.download='Acoustic-MC-remux-diagnostic.m4a';document.body.append(a);a.click();a.remove();recordInput(d.side,'remux保存操作',{blobSize:d.blob.size});}
function startRemuxAudioProbe(){
  const d=remuxDiagnostic;if(!d.blob||decodePending||Object.values(busy).some(Boolean)){say('読込・デコード終了後に診断してください。');return;}
  stopRemuxAudioProbe();pause();const audio=$('remuxProbeAudio'),token=d.token,side=d.side;let playingSeen=false,firstTime=null,finished=false;
  const state=()=>({currentTime:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null,readyState:audio.readyState,networkState:audio.networkState,mediaError:audio.error?{code:audio.error.code,message:audio.error.message}:null});
  const finish=(result,extra={})=>{if(finished||token!==d.token)return;finished=true;recordInput(side,'remux audio診断結果',{result,...state(),...extra});stopRemuxAudioProbe(result);$('remuxProbeStatus').textContent=result==='playback-progress'?'audio要素で再生位置の進行を確認しました。Web Audioとは別経路です。':'診断結果：'+result+'（単独ではコンテナ破損を断定できません）';};
  const handlers={loadedmetadata:()=>recordInput(side,'remux audio metadata',state()),loadeddata:()=>recordInput(side,'remux audio loadeddata',state()),canplay:()=>recordInput(side,'remux audio canplay',state()),playing:()=>{playingSeen=true;firstTime=audio.currentTime;recordInput(side,'remux audio playing',state());},timeupdate:()=>{if(playingSeen&&firstTime!==null&&audio.currentTime-firstTime>=.1)finish('playback-progress');},ended:()=>finish(playingSeen&&audio.currentTime>0?'playback-progress':'ended-inconclusive'),error:()=>finish('media-error')};
  for(const [event,handler]of Object.entries(handlers))audio.addEventListener(event,handler);d.cleanup=()=>{for(const [event,handler]of Object.entries(handlers))audio.removeEventListener(event,handler);};
  d.url=URL.createObjectURL(d.blob);audio.src=d.url;audio.preload='auto';audio.hidden=false;audio.muted=false;$('remuxProbe').disabled=true;$('remuxProbeStatus').textContent='audio要素でテスト再生中…（最大10秒）';
  recordInput(side,'remux audio診断開始',{blobSize:d.blob.size,mimeType:d.blob.type,canPlayType:audio.canPlayType(d.blob.type),userActivation:navigator.userActivation?.isActive??null});
  d.timer=setTimeout(()=>finish('timeout-inconclusive'),10000);
  try{const request=audio.play();request?.then(()=>{if(token===d.token)recordInput(side,'remux audio play resolved',state());},e=>finish(e.name==='NotAllowedError'?'gesture-blocked-inconclusive':'play-rejected',{error:e.name+': '+e.message}));}catch(e){finish('play-threw',{error:e.name+': '+e.message});}
}
