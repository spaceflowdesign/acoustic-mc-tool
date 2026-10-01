// Approved reference hierarchy: header, title/arrows, graph, mini waveform,
// source cards, two-column controls, MEMO, four-way bottom navigation.
const legacyWorkspaceInit=initWorkspace,legacyWorkspaceUpdate=updateWorkspace;
let selectedSide='A',controlPage=0,pendingGraph=null,fullMoves=[];
function moveWithMarker(el,parent){const marker=document.createComment('ui-home');el.before(marker);fullMoves.push({el,marker});parent.append(el);}
function saveBands(){try{localStorage.setItem('amct_bands_v1',JSON.stringify(bandSettings));}catch{say('帯域設定の保存ができません。このページ内でのみ保持します。');}}
function renderBandControls(){document.querySelectorAll('[data-band-mode]').forEach(s=>s.value=bandSettings.custom?'custom':'default');$('customValues').querySelectorAll('input').forEach((input,i)=>input.value=bandSettings.edges[i]);draw();}
function setBandMode(mode){bandSettings.custom=mode==='custom';saveBands();renderBandControls();if(bandSettings.custom)openDialog('bandsDialog');}
function shiftSeek(seconds){if($('seek').disabled)return;const [lo,hi]=limits();$('seek').value=Math.max(lo,Math.min(hi,position()+seconds));$('seek').dispatchEvent(new Event('input'));}
function makeAction(text,handler,attributes={}){const b=element('button',{class:'alt',type:'button',...attributes},text);b.onclick=handler;return b;}
function expandCurrentPage(){
  const target={listen:['wave','LISTEN · A/B WAVEFORM'],compare:['spectrum','COMPARE'],diff:['diffChart','DIFF FOCUS']}[activePage];
  if(target)expandGraph(...target);
}
function pageControls(index){controlPage=Math.max(0,Math.min(2,index));document.querySelectorAll('[data-control-page]').forEach(el=>el.hidden=Number(el.dataset.controlPage)!==controlPage);$('controlPrev').disabled=controlPage===0;$('controlNext').disabled=controlPage===2;$('controlRow').setAttribute('aria-label','操作パネル '+(controlPage+1)+' / 3');}
function initFullscreenControls(){
  const row=element('div',{id:'controlRow'},'<div id="fullGraphTabs" role="group" aria-label="全画面グラフ切替"><button id="fullCompare" class="alt" type="button">COMPARE</button><button id="fullDiff" class="alt" type="button">DIFF</button></div><button id="controlPrev" class="alt" aria-label="前の操作パネル">◀</button><div id="controlPages"></div><button id="controlNext" class="alt" aria-label="次の操作パネル">▶</button>');$('graphDialog').append(row);
  $('fullCompare').onclick=()=>switchFullscreenGraph('compare');$('fullDiff').onclick=()=>switchFullscreenGraph('diff');
  const pages=Array.from({length:3},(_,i)=>{const p=element('div',{'data-control-page':i,class:'control-page'});$('controlPages').append(p);return p;});
  pages[0].append(makeAction('▶',()=>playing?pause():play(selectedSide),{id:'fullPlay','aria-label':'PLAY'}),makeAction('A / B',()=>{selectedSide=(playing||selectedSide)==='A'?'B':'A';if(playing)void play(selectedSide);updateWorkspace();},{id:'fullAB','aria-label':'A/B切替'}),makeAction('■',()=>pause(true),{id:'fullStop','aria-label':'STOP',title:'STOP'}),makeAction('GAIN',toggleGainMatch,{'data-gain-copy':''}));
  pages[1].append(makeAction('−5s',()=>shiftSeek(-5),{'aria-label':'5秒戻る'}),makeAction('+5s',()=>shiftSeek(5),{'aria-label':'5秒進む'}),makeAction('SYNC',()=>$('sync').click(),{'data-auto-copy':'','aria-label':'AUTO SYNC',title:'AUTO SYNC'}),makeAction('↔',()=>openDialog('syncDialog'),{'aria-label':'MANUAL SYNC',title:'MANUAL SYNC'}),makeAction('GAIN',toggleGainMatch,{'data-gain-copy':''}));
  const smoothing=element('select',{'aria-label':'全画面 Smoothing',id:'fullSmoothing'},'<option value="0">Smoothing OFF</option><option value="0.16666666666666666">1/6 Oct</option><option value="0.3333333333333333">1/3 Oct</option>');smoothing.value=String(smoothingOct);smoothing.onchange=()=>{$('smoothing').value=smoothing.value;$('smoothing').dispatchEvent(new Event('change'));};pages[1].append(smoothing);
  const mode=$('freqMode').cloneNode(true);mode.id='fullFreqMode';mode.setAttribute('aria-label','全画面 表示方式');mode.onchange=()=>{$('freqMode').value=mode.value;updateWorkspace();draw();};pages[2].append(mode);
  const bands=element('select',{'data-band-mode':'','aria-label':'全画面 Default / Custom'},'<option value="default">Default</option><option value="custom">Custom</option>');bands.onchange=()=>setBandMode(bands.value);pages[2].append(bands,makeAction('帯域編集',()=>openDialog('bandsDialog')),makeAction('DIFF ON',()=>{showInlineDiff=!showInlineDiff;updateWorkspace();draw();},{'data-diff-copy':''}));
  $('controlPrev').onclick=()=>pageControls(controlPage-1);$('controlNext').onclick=()=>pageControls(controlPage+1);pageControls(0);
}
initWorkspace=function(){
  legacyWorkspaceInit();colors.B='#ff43df';workspacePages.unshift('listen');document.body.classList.add('fixed-design');
  const wrap=document.querySelector('.wrap'),nav=document.querySelector('nav.tabs'),navWrap=document.querySelector('.workspace-nav'),compare=document.querySelector('[data-panel=compare]'),visual=$('spectrum').closest('.card');
  const listen=element('section',{'data-panel':'listen',hidden:''},'<div class="listen-heading">LISTEN · 耳でA/Bを比較</div>');compare.before(listen);
  const listenTab=makeAction('LISTEN',()=>changePage('listen'),{class:'tab','data-page':'listen'});nav.prepend(listenTab);wrap.append(nav);nav.classList.add('bottom-nav');navWrap.insertBefore(element('h1',{id:'pageTitle'},'COMPARE'),$('nextPage'));
  const help=document.querySelector('.source-ribbon .help-button');document.querySelector('.top .pill').hidden=true;document.querySelector('.top').append(help);
  const menu=makeAction('☰',()=>openDialog('toolsDialog'),{'aria-label':'ツールメニュー',class:'menu-button alt'});document.querySelector('.top').prepend(menu);
  addDialog('toolsDialog','TOOLS').querySelector('.dialog-body').append(makeAction('AIR REC',()=>{$('toolsDialog').close();changePage('live');}),makeAction('FILE / SAVE AUDIO',()=>openDialog('sourceDialog')),makeAction('MANUAL SYNC',()=>openDialog('syncDialog')),makeAction('波形グラフ',()=>expandGraph('wave','WAVEFORM')),makeAction('ABOUT / HOW IT WORKS',()=>openDialog('aboutDialog')));
  document.querySelector('.brand small').textContent='LISTEN · COMPARE · ANALYZE · TRUST';
  visual.id='compareVisual';visual.querySelector('.graph-heading').hidden=true;visual.querySelector('.graph-tabs').hidden=true;visual.querySelector('.legend').hidden=true;visual.querySelector('.graph-scope').hidden=true;
  $('wave').parentElement.hidden=true;$('spectrum').parentElement.hidden=false;
  const mini=element('div',{id:'miniStrip'},'<div class="mini-info"><output id="miniTime">00:00 / 00:00</output><span id="visualStatus">原音の平均解析</span></div><canvas id="miniWave" aria-label="同期後の再生位置とA/B波形"></canvas>');compare.after(mini);mini.append($('seek'));$('seek').setAttribute('aria-label','再生位置');
  mini.before(document.querySelector('[data-panel=diff]'));
  const ribbon=document.querySelector('.source-ribbon');mini.after(ribbon);
  const panel=element('div',{id:'mainControls'},'<button id="inlineDiff" class="alt" aria-pressed="true">▥　DIFF<br><small>B − A (dB)</small></button><label class="smoothing-label">Smoothing<select id="smoothing" aria-label="Smoothing"><option value="0" selected>OFF</option><option value="0.16666666666666666">1/6 Oct</option><option value="0.3333333333333333">1/3 Oct</option></select></label>');ribbon.after(panel);panel.append($('gainToggle'),makeAction('⛓　AUTO SYNC',()=>$('sync').click(),{id:'quickSync'}),makeAction('▤　MEMO　　Add notes …　›',()=>changePage('history'),{id:'quickMemo'}));
  const extras=element('div',{id:'displayControls'});extras.append($('freqMode'));
  const bandMode=element('select',{'data-band-mode':'','aria-label':'Default / Custom'},'<option value="default">Default</option><option value="custom">Custom</option>');bandMode.onchange=()=>setBandMode(bandMode.value);extras.append(bandMode,makeAction('帯域編集',()=>openDialog('bandsDialog')),makeAction('⛶',expandCurrentPage,{'aria-label':'横画面フルスクリーン'}));panel.append(extras);
  $('freqMode').value='music';$('freqMode').setAttribute('aria-label','表示方式');$('freqMode').onchange=()=>{updateWorkspace();draw();};
  $('smoothing').onchange=()=>{smoothingOct=Number($('smoothing').value);visualState.smoothed={};focusedBand=null;updateWorkspace();draw();};$('inlineDiff').onclick=()=>{showInlineDiff=!showInlineDiff;updateWorkspace();draw();};
  const displayDialog=addDialog('displayDialog','DISPLAY / BANDS');displayDialog.querySelector('.dialog-body').append($('smoothing'),extras);
  const settingsLabel=document.querySelector('.smoothing-label');settingsLabel.replaceChildren(makeAction('Smoothing　⌄<br><small>OFF · 表示設定</small>',()=>openDialog('displayDialog'),{id:'openDisplay','aria-label':'Smoothing・帯域表示設定'}));
  $('smoothing').addEventListener('change',()=>{$('openDisplay').innerHTML='Smoothing　⌄<br><small>'+($('smoothing').selectedOptions[0].textContent)+' · 表示設定</small>';});
  const expandInline=makeAction('⛶',expandCurrentPage,{'aria-label':'グラフを横画面に拡大',class:'inline-expand alt'});$('miniStrip').querySelector('.mini-info').append(expandInline);
  panel.after($('transportDock'));$('transportDock').classList.add('compact-transport');$('transportDock').querySelector('.seeklabel').hidden=true;
  $('status').remove();const status=element('p',{id:'status',role:'status','aria-live':'polite',class:'workspace-status'},'A/Bへ音源を読み込んでください。');$('transportDock').after(status);
  const bandsDialog=addDialog('bandsDialog','CUSTOM BANDS');bandsDialog.querySelector('.dialog-body').append(element('p',{},'隣接する境界を20〜20,000 Hzの範囲で昇順に指定します。'),element('div',{id:'customValues'}));
  bandSettings.edges.forEach((v,i)=>{const label=element('label',{},i===0?'SUB 下限 (Hz)':i===6?'TREBLE 上限 (Hz)':musicNames[i-1]+' / '+musicNames[i]+' (Hz)');const input=element('input',{type:'number',min:20,max:20000,step:'any',value:v,'aria-label':'帯域境界 '+i});label.append(input);$('customValues').append(label);});
  bandsDialog.querySelector('.dialog-body').append(element('p',{id:'bandError',role:'status'}),makeAction('適用・保存',()=>{const edges=Array.from($('customValues').querySelectorAll('input'),el=>el.value.trim()===''?NaN:Number(el.value));if(!validEdges(edges)){$('bandError').textContent='20〜20,000 Hz内で、境界が重ならない昇順の数値を指定してください。';return;}bandSettings={edges,custom:true};saveBands();renderBandControls();$('bandError').textContent='';bandsDialog.close();},{id:'saveBands'}),makeAction('Defaultへ戻す',()=>{bandSettings={edges:[...defaultEdges],custom:false};saveBands();renderBandControls();$('bandError').textContent='';},{id:'resetBands'}));
  addDialog('rotateDialog','横画面に回転してください').querySelector('.dialog-body').textContent='画面の回転ロックを解除して、端末を横向きにしてください。横向きになるとグラフを拡大します。縦画面フルスクリーンは使用しません。';$('rotateDialog').addEventListener('close',()=>{if(!matchMedia('(orientation: landscape)').matches)pendingGraph=null;});
  initFullscreenControls();
  const exit=$('graphDialog').querySelector('[data-close]');exit.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></svg>';exit.setAttribute('aria-label','フルスクリーン解除');exit.title='フルスクリーン解除';
  const about=$('aboutDialog').querySelector('.dialog-body');for(const [title,text]of [
    ['音楽制作向けDefault帯域','SUB 20–60 Hz / BASS 60–250 Hz / LOW MID 250–500 Hz / MID 500 Hz–2 kHz / HIGH MID 2–8 kHz / TREBLE 8–20 kHz。Toolの音楽制作向け初期区分です。名称に国際規格上の単一の固定境界があるわけではありません。'],
    ['Custom帯域','下側操作パネルから7つの境界を編集します。設定はこのブラウザへ保存し、Defaultへいつでも戻せます。FFT分解能より狭い区間やNyquistを超える区間は測定値を捏造せず表示対象外にします。音声・同期・GAIN MATCHには作用しません。'],
    ['規格モード','ISO 266 / IEC 61260系の公称中心周波数20、25、31.5…20k Hzの1/3 octave表示です。FFT帯域集計であり、規格適合フィルターバンクとは主張しません。音楽帯域ラベルは位置の目安として残し、解析の中心周波数と混同しません。'],
    ['追従グラフ・Smoothing・DIFF','再生中は同期した現在位置付近の8192サンプルをA/B各チャンネルから読み、WorkerでHann窓FFTを約10回/秒計算します。線の時間補間は表示だけです。MUSICのSmoothingは帯域平均幅（OFF / 1/6 / 1/3 octave）で、規格モードは固定1/3 octaveです。比較グラフ下のDIFFはその時点のパワー差、DIFF画面も同期後の現在位置に追従し、同じSmoothing条件でB−Aを表示します。GAIN MATCH ONではCOMPAREとDIFFの表示に再生と同じMatch Offsetを加えます。Original Level・元解析・保存音声は原音のままです。停止時は平均解析へ戻ります。'],
    ['横画面表示とLISTEN','拡大グラフは横向きのみで、縦向きでは回転案内を表示します。ブラウザバーを必ず消すOS全画面ではありません。操作パネルは◀ / ▶で切替、−5 s / +5 sは同期した共通時間軸のシークです。全画面のCOMPARE / DIFFは固定ボタンで直接切替でき、波形はLISTEN全画面だけに表示します。LISTENは解析グラフを隠し、波形・A/B再生・SYNC・GAIN MATCHに集中します。']]){const section=element('section');section.append(element('h3',{},title),element('p',{},text));about.append(section);}
  helpText.Tool.push('LISTEN / COMPARE / DIFF / MEMOを矢印か下部ボタンで切り替えます。横スワイプ操作はありません。');
  helpText.DIFF[0]='原音の平均パワーを比較します。MUSICではDefault / Customの6帯域、STANDARDでは公称中心周波数の1/3 octave帯域を使用します。正の差はB、負の差はAが大きいことを示します。';
  helpText['ファイルと再生']=helpText['ファイルと再生'].map(text=>text.replace('音量補正は行いません。','GAIN MATCH OFFでは原音レベルで再生します。'));
  renderBandControls();updateWorkspace();requestAnimationFrame(visualTick);
};
stepPage=function(direction){const i=workspacePages.indexOf(activePage);changePage(workspacePages[Math.max(0,Math.min(workspacePages.length-1,(i<0?0:i)+direction))]);};
updateWorkspace=function(){
  legacyWorkspaceUpdate();if(!$('mainControls'))return;
  const compareLike=['compare','listen','diff'].includes(activePage);$('pageTitle').textContent=activePage==='history'?'MEMO':activePage.toUpperCase();$('nextPage').disabled=workspacePages.indexOf(activePage)===workspacePages.length-1;
  if(!playing)visualState.frames={};
  for(const id of ['miniStrip','mainControls','transportDock'])$(id).hidden=!compareLike;document.querySelector('.source-ribbon').hidden=!compareLike;
  if(fullGraph)$('miniStrip').hidden=fullGraph.id!=='wave';
  $('wave').parentElement.hidden=fullGraph?.id!=='wave';$('spectrum').parentElement.hidden=false;
  $('quickSync').disabled=$('sync').disabled;$('quickMemo').hidden=activePage==='listen';$('inlineDiff').hidden=activePage==='listen';document.querySelector('.smoothing-label').hidden=activePage==='listen';
  $('inlineDiff').setAttribute('aria-pressed',String(showInlineDiff));
  if(playing)selectedSide=playing;else if(!slots[selectedSide]&&slots[selectedSide==='A'?'B':'A'])selectedSide=selectedSide==='A'?'B':'A';
  $('fullPlay').textContent=playing?'‖':selectedSide+' ▶';$('fullPlay').setAttribute('aria-label',playing?'PAUSE':selectedSide+' PLAY');$('fullPlay').title=$('fullPlay').getAttribute('aria-label');$('fullPlay').disabled=playing?false:$('play'+selectedSide).disabled;$('fullAB').textContent='A / B';$('fullAB').setAttribute('aria-label','A/B切替（現在 '+selectedSide+'）');$('fullAB').disabled=$('playA').disabled||$('playB').disabled;
  for(const [id,target]of [['fullCompare','spectrum'],['fullDiff','diffChart']])$(id).setAttribute('aria-pressed',String(fullGraph?.id===target));
  document.querySelectorAll('[data-gain-copy]').forEach(b=>{b.textContent='GAIN '+(gainEnabled?'ON':'OFF');b.setAttribute('aria-label','GAIN MATCH '+(gainEnabled?'ON':'OFF'));b.title=b.getAttribute('aria-label');b.disabled=$('gainToggle').disabled;b.setAttribute('aria-pressed',String(gainEnabled));});
  document.querySelectorAll('[data-auto-copy]').forEach(b=>b.disabled=$('sync').disabled);document.querySelectorAll('[data-diff-copy]').forEach(b=>b.textContent='DIFF '+(showInlineDiff?'ON':'OFF'));
  document.querySelectorAll('[data-source]').forEach(b=>b.classList.toggle('is-playing',playing===b.dataset.source));
  $('fullFreqMode').value=$('freqMode').value;$('fullSmoothing').value=$('smoothing').value=String($('freqMode').value==='standard'?1/3:smoothingOct);$('fullSmoothing').disabled=$('smoothing').disabled=$('freqMode').value==='standard';
  $('openDisplay').innerHTML='Smoothing　⌄<br><small>'+($('freqMode').value==='standard'?'1/3 Oct 固定':smoothingOct?'1/'+Math.round(1/smoothingOct)+' Oct':'OFF')+' · 表示設定</small>';
};
expandGraph=function(id,title){
  if(fullGraph)return;if(!matchMedia('(orientation: landscape)').matches){pendingGraph={id,title};openDialog('rotateDialog');return;}
  pendingGraph=null;const box=$(id).parentElement,marker=document.createComment('graph-home');box.before(marker);fullGraph={id,box,marker,trigger:document.activeElement};box.hidden=false;$('graphHost').append(box);
  moveWithMarker($('miniStrip'),$('graphDialog'));$('graphDialog').append($('controlRow'));$('miniStrip').hidden=id!=='wave';$('graphDialog').classList.toggle('listen-fullscreen',id==='wave');$('graphDialog').querySelector('h2').textContent=title;openDialog('graphDialog');pageControls(0);updateWorkspace();draw();
};
function switchFullscreenGraph(page){
  if(!fullGraph||!$('graphDialog').open||!['compare','diff'].includes(page))return;
  const id=page==='compare'?'spectrum':'diffChart';if(fullGraph.id===id)return;
  const trigger=fullGraph.trigger;fullGraph.marker.replaceWith(fullGraph.box);
  const box=$(id).parentElement,marker=document.createComment('graph-home');box.before(marker);fullGraph={id,box,marker,trigger};box.hidden=false;$('graphHost').append(box);
  $('graphDialog').classList.remove('listen-fullscreen');$('graphDialog').querySelector('h2').textContent=page==='compare'?'COMPARE':'DIFF FOCUS';
  // DOM/layout only: do not close/reopen the modal or touch transport/audio.
  changePage(page);updateWorkspace();draw();
}
restoreGraph=function(){if(!fullGraph||$('graphDialog').open)return;const {box,marker,trigger}=fullGraph;marker.replaceWith(box);for(const {el,marker:m}of fullMoves)m.replaceWith(el);fullMoves=[];fullGraph=null;$('graphDialog').classList.remove('listen-fullscreen');updateWorkspace();draw();trigger?.focus();};
window.addEventListener('resize',()=>{if(matchMedia('(orientation: landscape)').matches&&pendingGraph){const p=pendingGraph;pendingGraph=null;$('rotateDialog').close();expandGraph(p.id,p.title);}else if(!matchMedia('(orientation: landscape)').matches&&fullGraph){const p={id:fullGraph.id,title:$('graphDialog').querySelector('h2').textContent};$('graphDialog').close();restoreGraph();pendingGraph=p;openDialog('rotateDialog');}});
