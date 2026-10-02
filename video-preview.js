// Stable per-slot muted video. Web Audio remains the sole audio clock.
const videoPreview={records:{},slot:null,url:null};
function videoTimeFor(side,seconds,alignment,duration){return Math.max(0,Math.min(Math.max(0,duration-.001),seconds+(side==='B'?alignment:0)));}
function releaseVideoRecord(r){
  r.generation++;r.pending=false;r.blocked=false;r.slot=null;r.video.pause();r.video.removeAttribute('src');r.video.load();r.video.hidden=true;
  if(r.url)URL.revokeObjectURL(r.url);r.url=null;
}
function releaseVideoPreview(){for(const r of Object.values(videoPreview.records))releaseVideoRecord(r);videoPreview.slot=null;videoPreview.url=null;}
function syncVideoPreview(){
  const panel=$('listenVideoPanel');if(!panel)return;
  for(const [key,r]of Object.entries(videoPreview.records))if(r.slot&&r.slot!==slots[key])releaseVideoRecord(r);
  const side=playing||selectedSide,slot=slots[side],r=videoPreview.records[side],v=r.video;
  const active=activePage==='listen'&&!document.hidden&&!busy.A&&!busy.B&&slot?.media?.isVideo;
  panel.hidden=!active||!!fullGraph;
  for(const [key,other]of Object.entries(videoPreview.records)){other.video.hidden=key!==side||!active;if(key!==side||!active){if(!other.video.paused)other.video.pause();}}
  if(!active){videoPreview.slot=null;videoPreview.url=null;return;}
  if(v.id!=='listenVideo'){for(const other of Object.values(videoPreview.records))other.video.removeAttribute('id');v.id='listenVideo';}
  videoPreview.slot=slot;$('videoSource').textContent=side+' VIDEO · '+slot.name+(slot.media.notice?' · '+slot.media.notice:'');
  if(r.slot!==slot){
    releaseVideoRecord(r);r.slot=slot;r.url=URL.createObjectURL(slot.blob);r.token=-1;r.lastSeek=-Infinity;
    v.muted=true;v.defaultMuted=true;v.volume=0;v.src=r.url;v.hidden=false;v.style.visibility='hidden';v.load();
  }
  videoPreview.url=r.url;const tokenChanged=r.token!==playToken;if(tokenChanged){r.blocked=false;r.token=playToken;}
  $('retryVideo').hidden=!r.blocked;if(r.blocked||v.readyState<1)return;
  if(!v.videoWidth){$('videoStatus').textContent='このファイルの映像をブラウザが表示できません。音声は保持しています。';return;}
  const target=videoTimeFor(side,position(),offset,Number.isFinite(v.duration)?v.duration:slot.buffer.duration),delta=target-v.currentTime;
  const shouldPlay=!!playing&&!!ctx&&ctx.currentTime>=origin+cursor,changed=tokenChanged||r.offset!==offset||r.wasPlaying!==shouldPlay;
  r.token=playToken;r.offset=offset;r.wasPlaying=shouldPlay;if(!shouldPlay&&!v.paused)v.pause();
  const now=performance.now();
  // Native continuous playback; bounded drift seeks, never flicker for small errors.
  if(!v.seeking&&Math.abs(delta)>(changed?.015:shouldPlay?.25:.015)&&(changed||!shouldPlay||now-r.lastSeek>1000)){
    r.lastSeek=now;try{v.currentTime=target;}catch(error){$('videoStatus').textContent='映像シークを待っています：'+error.message;}return;
  }
  if(v.readyState>=2)v.style.visibility='visible';
  $('videoStatus').textContent=v.seeking?'映像位置を同期しています…':'映像は音声の再生位置に同期 · 音声出力はA/B側のみ';
  const rate=shouldPlay&&Math.abs(delta)>.04?(delta>0?1.02:.98):1;if(v.playbackRate!==rate)v.playbackRate=rate;
  if(shouldPlay&&v.paused&&!r.pending){
    const generation=r.generation;r.pending=true;
    Promise.resolve(v.play()).then(()=>{if(generation===r.generation){r.pending=false;if(!playing||document.hidden||activePage!=='listen'||(playing||selectedSide)!==side)v.pause();}},error=>{
      if(generation!==r.generation)return;r.pending=false;r.blocked=true;$('videoStatus').textContent='映像を開始できません。映像再試行を押してください。 '+error.message;$('retryVideo').hidden=false;
    });
  }
}
const mediaWorkspaceInit=initWorkspace,mediaWorkspaceUpdate=updateWorkspace;
initWorkspace=function(){
  mediaWorkspaceInit();
  const panel=element('div',{id:'listenVideoPanel',hidden:''},'<div id="videoSource"></div><p id="videoStatus" role="status"></p><button id="retryVideo" type="button" class="alt" hidden>映像再試行</button>');
  document.querySelector('[data-panel=listen]').append(panel);
  for(const side of ['A','B']){
    const v=element('video',{muted:'',playsinline:'','webkit-playsinline':'',preload:'metadata',disablepictureinpicture:'','aria-label':side+' 動画映像',hidden:''});
    v.muted=true;v.defaultMuted=true;v.volume=0;if(side==='A')v.id='listenVideo';$('videoStatus').before(v);
    const r=videoPreview.records[side]={video:v,slot:null,url:null,generation:0,pending:false,blocked:false,lastSeek:-Infinity,token:-1};
    for(const event of ['loadedmetadata','loadeddata','seeked','canplay'])v.addEventListener(event,()=>{if(r.slot&&side===(playing||selectedSide))syncVideoPreview();});
    v.addEventListener('error',()=>{if(!r.slot||!v.getAttribute('src'))return;r.blocked=true;if(side===(playing||selectedSide)){$('videoStatus').textContent='このブラウザで映像を開けません。音声は保持しています。';$('retryVideo').hidden=false;}});
  }
  $('retryVideo').onclick=()=>{const r=videoPreview.records[playing||selectedSide];r.blocked=false;if(r.video.error)r.video.load();syncVideoPreview();};
  for(const k of ['A','B']){const input=$('file'+k);input.accept='audio/*,video/*,.mov,.mp4,.m4v,.m4a,.wav,.mp3,.webm';document.querySelector('label[for=file'+k+']').textContent='FILE / 音声・動画';}
  helpText['ファイルと再生'].push('写真ライブラリ・撮影・ファイル選択は同じ入力として処理します。MP4/MOVのAAC/ALAC音声は再圧縮せず音声トラックだけを取り出して解析します。元動画はSAVE時まで変更しません。映像はLISTEN専用で、他画面やバックグラウンドでは映像を一時停止し、同じ要素とURLを保持します。音源交換時は旧URLを解放します。波形拡大では映像を隠すだけで再生経路を維持します。映像の形式がブラウザ非対応の場合は明示し、解析済み音声は保持します。');
  const section=element('section');section.append(element('h3',{},'動画入力 / LISTEN'),element('p',{},'動画の音声を既存A/B処理で解析・再生します。映像は選択中の1スロットだけをミュート・インライン表示し、Web Audioの時刻にBのSYNCオフセットを加えて追従します。映像自身を連続再生し、大きな位置ずれだけを補正します。A/B各要素とURLを保持し、微小なずれで映像を隠しません。映像は別のデコーダーなのでサンプル単位の同期保証はありません。Safariの映像コーデック、低電力・自動再生制限、写真ライブラリ側のファイル提供失敗はWeb側だけでは解決できません。'));
  $('aboutDialog').querySelector('.dialog-body').append(section);
  const alternateHelp=element('p');alternateHelp.textContent='複数音声の動画は、同じ代替グループにファイルが有効として指定した既定トラックが1つある場合、その音声を比較します。iPhoneの空間オーディオ動画では互換ステレオが既定の場合があります。選択したトラックは読み込み結果・LISTEN・入力診断で確認できます。空間音声やPhotosのAudio Mix処理をToolで再現するものではありません。選択が曖昧、または既定音声を単独抽出できない形式は、別音声へ勝手に変更せずエラーを表示します。';section.append(alternateHelp);
  document.addEventListener('visibilitychange',syncVideoPreview);window.addEventListener('pagehide',releaseVideoPreview);
  setInterval(syncVideoPreview,100);syncVideoPreview();
};
updateWorkspace=function(){mediaWorkspaceUpdate();syncVideoPreview();};
