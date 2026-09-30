// A single muted, inline visual decoder follows Web Audio's existing clock.
// Never route this element's audio to the speakers or use it as transport master.
const videoPreview={slot:null,url:null,generation:0,pending:false,blocked:false,token:0};
function videoTimeFor(side,seconds,alignment,duration){return Math.max(0,Math.min(Math.max(0,duration-.001),seconds+(side==='B'?alignment:0)));}
function releaseVideoPreview(){
  const v=$('listenVideo');if(!v)return;
  videoPreview.generation++;videoPreview.pending=false;videoPreview.blocked=false;videoPreview.slot=null;
  v.pause();v.removeAttribute('src');v.load();v.style.visibility='hidden';
  if(videoPreview.url)URL.revokeObjectURL(videoPreview.url);videoPreview.url=null;
}
function syncVideoPreview(){
  const v=$('listenVideo'),panel=$('listenVideoPanel');if(!v)return;
  const side=playing||selectedSide,slot=slots[side],active=activePage==='listen'&&!document.hidden&&!busy.A&&!busy.B&&slot?.media?.isVideo;
  // Fullscreen is visual only. Do not load/unload a native media element at
  // that boundary: even muted media lifecycle can affect Safari's audio session.
  panel.hidden=!active||!!fullGraph;
  if(!active){if(videoPreview.slot)releaseVideoPreview();return;}
  if(fullGraph){if(!playing&&!v.paused)v.pause();return;}
  $('videoSource').textContent=side+' VIDEO · '+slot.name+(slot.media.notice?' · '+slot.media.notice:'');
  if(videoPreview.slot!==slot){
    releaseVideoPreview();videoPreview.slot=slot;videoPreview.url=URL.createObjectURL(slot.blob);videoPreview.token=playToken;
    v.muted=true;v.defaultMuted=true;v.volume=0;v.src=videoPreview.url;v.load();$('videoStatus').textContent='映像を読み込んでいます…';
  }
  if(videoPreview.token!==playToken){videoPreview.token=playToken;videoPreview.blocked=false;}
  if(videoPreview.blocked){$('retryVideo').hidden=false;return;}$('retryVideo').hidden=true;
  if(v.readyState<1)return;
  if(!v.videoWidth){$('videoStatus').textContent='このファイルの映像トラックをブラウザが表示できません。音声は保持しています。';return;}
  const target=videoTimeFor(side,position(),offset,Number.isFinite(v.duration)?v.duration:slot.buffer.duration),delta=target-v.currentTime;
  const shouldPlay=!!playing&&!!ctx&&ctx.currentTime>=origin+cursor;
  if(!shouldPlay&&!v.paused)v.pause();
  if(!v.seeking&&Math.abs(delta)>(shouldPlay?.10:.015)){
    v.style.visibility='hidden';$('videoStatus').textContent='映像位置を同期しています…';
    try{v.currentTime=target;}catch(error){$('videoStatus').textContent='映像シークを待っています：'+error.message;}return;
  }
  const aligned=!v.seeking&&v.readyState>=2&&Math.abs(delta)<.15;
  v.style.visibility=aligned?'visible':'hidden';$('videoStatus').textContent=aligned?'映像は音声の再生位置に同期 · 音声出力はA/B側のみ':'映像位置を同期しています…';
  v.playbackRate=shouldPlay&&Math.abs(delta)>.035?(delta>0?1.03:.97):1;
  if(shouldPlay&&v.paused&&!videoPreview.pending){
    const generation=videoPreview.generation;videoPreview.pending=true;
    Promise.resolve(v.play()).then(()=>{if(generation===videoPreview.generation)videoPreview.pending=false;},error=>{
      if(generation!==videoPreview.generation)return;videoPreview.pending=false;videoPreview.blocked=true;v.style.visibility='hidden';$('videoStatus').textContent='映像を開始できません。映像再試行を押してください。 '+error.message;$('retryVideo').hidden=false;
    });
  }
}
const mediaWorkspaceInit=initWorkspace,mediaWorkspaceUpdate=updateWorkspace;
initWorkspace=function(){
  mediaWorkspaceInit();
  const panel=element('div',{id:'listenVideoPanel',hidden:''},'<div id="videoSource"></div><video id="listenVideo" muted playsinline webkit-playsinline preload="metadata" disablepictureinpicture aria-label="選択中のA/B動画映像"></video><p id="videoStatus" role="status"></p><button id="retryVideo" type="button" class="alt" hidden>映像再試行</button>');
  document.querySelector('[data-panel=listen]').append(panel);
  const v=$('listenVideo');v.muted=true;v.defaultMuted=true;v.volume=0;
  for(const event of ['loadedmetadata','loadeddata','seeked','canplay'])v.addEventListener(event,syncVideoPreview);
  v.addEventListener('error',()=>{if(!videoPreview.slot||!v.getAttribute('src'))return;videoPreview.blocked=true;v.style.visibility='hidden';$('videoStatus').textContent='このブラウザで映像を開けません（形式・コーデックを確認してください）。読み込んだ音声は保持しています。';$('retryVideo').hidden=false;});
  $('retryVideo').onclick=()=>{videoPreview.blocked=false;if(v.error){const src=v.src;v.src=src;v.load();}syncVideoPreview();};
  for(const k of ['A','B']){const input=$('file'+k);input.accept='audio/*,video/*,.mov,.mp4,.m4v,.m4a,.wav,.mp3,.webm';document.querySelector('label[for=file'+k+']').textContent='FILE / 音声・動画';}
  helpText['ファイルと再生'].push('写真ライブラリ・撮影・ファイル選択は同じ入力として処理します。MP4/MOVのAAC/ALAC音声は再圧縮せず音声トラックだけを取り出して解析します。元動画はSAVE時まで変更しません。映像はLISTEN専用で、他画面では映像デコーダーを解放します。波形拡大では映像を隠すだけで再生経路を維持します。映像の形式がブラウザ非対応の場合は明示し、解析済み音声は保持します。');
  const section=element('section');section.append(element('h3',{},'動画入力 / LISTEN'),element('p',{},'動画の音声を既存A/B処理で解析・再生します。映像は選択中の1スロットだけをミュート・インライン表示し、Web Audioの時刻にBのSYNCオフセットを加えて追従します。A/B切替・シーク中は古い位置の映像を隠し、同期後に表示します。映像は別のデコーダーなのでサンプル単位の同期保証はありません。Safariの映像コーデック、低電力・自動再生制限、写真ライブラリ側のファイル提供失敗はWeb側だけでは解決できません。'));
  $('aboutDialog').querySelector('.dialog-body').append(section);
  const alternateHelp=element('p');alternateHelp.textContent='複数音声の動画は、同じ代替グループにファイルが有効として指定した既定トラックが1つある場合、その音声を比較します。iPhoneの空間オーディオ動画では互換ステレオが既定の場合があります。選択したトラックは読み込み結果・LISTEN・入力診断で確認できます。空間音声やPhotosのAudio Mix処理をToolで再現するものではありません。選択が曖昧、または既定音声を単独抽出できない形式は、別音声へ勝手に変更せずエラーを表示します。';section.append(alternateHelp);
  document.addEventListener('visibilitychange',syncVideoPreview);window.addEventListener('pagehide',releaseVideoPreview);
  setInterval(syncVideoPreview,40);syncVideoPreview();
};
updateWorkspace=function(){mediaWorkspaceUpdate();syncVideoPreview();};
