// Reorganize existing controls/canvases rather than replace their event handlers.
const workspacePages=['compare','diff','history'];
let compareView='spectrum',memoView='memo',fullGraph=null,returnPage='compare';
const helpText={};
function element(tag,attributes={},content=''){
  const el=document.createElement(tag);for(const [k,v]of Object.entries(attributes))el.setAttribute(k,v);el.innerHTML=content;return el;
}
function addDialog(id,title){
  const modal=element('dialog',{id,'aria-label':title},`<div class="dialog-head"><h2>${title}</h2><button type="button" data-close>閉じる ×</button></div><div class="dialog-body"></div>`);
  document.body.append(modal);modal.querySelector('[data-close]').onclick=()=>modal.close();
  modal.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open')});
  return modal;
}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();document.body.classList.add('modal-open')}
function showHelp(topic){
  const host=$('helpDialog').querySelector('.dialog-body');host.replaceChildren();
  for(const text of helpText[topic]||[]){const p=document.createElement('p');p.textContent=text;host.append(p)}
  if(topic==='GAIN MATCH')host.append(element('pre',{id:'gainLevels',class:'gain-levels'}));
  else{const gain=element('button',{class:'alt'},'GAIN MATCH ?');gain.onclick=()=>showHelp('GAIN MATCH');host.prepend(gain)}
  const details=element('button',{class:'alt about-link'},'詳しい処理を見る');details.onclick=()=>openDialog('aboutDialog');host.append(details);
  renderGainMatch();
  openDialog('helpDialog');
}
function helpFooter(host,topic){if(topic==='DIFF'){graphHelp(host,topic);return}const row=element('div',{class:'help-tools'},'<span>使い方・表示の意味</span><button class="help-button" aria-label="'+topic+'の説明">?</button>');row.querySelector('button').onclick=()=>showHelp(topic);host.append(row)}
function graphHelp(host,topic){const button=element('button',{class:'help-button','aria-label':topic+'の説明'},'?');button.onclick=()=>showHelp(topic);host.querySelector('.graph-heading').prepend(button)}
function collectHelp(root,topic){
  helpText[topic]=[];root.querySelectorAll('.note:not(#syncStatus):not(#referenceStatus),.jp-sub').forEach(el=>{helpText[topic].push(el.textContent);el.hidden=true});
}
function initWorkspace(){
  document.body.classList.add('workspace');
  const compare=document.querySelector('[data-panel=compare]'),live=document.querySelector('[data-panel=live]'),history=document.querySelector('[data-panel=history]');
  const [filesCard,syncCard,visualCard]=compare.querySelectorAll(':scope > .card');
  collectHelp(filesCard,'ファイルと再生');collectHelp(syncCard,'同期');collectHelp(visualCard,'解析');collectHelp(live,'AIR REC');collectHelp(history,'MEMO / REFERENCE');
  helpText.Tool=[document.querySelector('.intro').textContent,...Array.from(document.querySelectorAll('.privacy span'),e=>e.textContent),document.querySelector('footer').textContent];
  document.querySelector('.intro').hidden=true;document.querySelector('.privacy').hidden=true;document.querySelector('footer').hidden=true;
  const help=addDialog('helpDialog','HELP');help.querySelector('.dialog-body').classList.add('help-content');
  helpText['GAIN MATCH']=['GAIN MATCH','A/Bの音量差を補正し、音量による聴感上の偏りを抑えて比較します。','FILEとAIR RECでは、それぞれの比較目的に適した方式を自動で使用します。'];
  const about=addDialog('aboutDialog','ABOUT / HOW IT WORKS');about.querySelector('.dialog-body').classList.add('help-content');
  const sections=[
    ['FILE比較 / GAIN MATCH','Mix・Master・Processingを音量差の影響を抑えて比較します。同期後、両方に音声データが存在する共通比較区間を対象にします。再生カーソル以降だけでなく、現在の同期設定で再生できる区間全体です。K-weightingで耳の周波数感度を近似し、400 msブロック・100 ms間隔でエネルギーを集計します。−70 LUFSの絶対ゲートと、その後の平均より−10 LUの相対ゲートを各側に適用して、比較区間のLoudness差を算出します。大きい側のみ減衰し、小さい側は増幅しません。',
      'BS.1770系の考え方に基づきますが、規格適合認証されたメーターではありません。Kフィルターは音源の先頭から連続処理し、区間端は約10 msのenergy集計から補間します。表示はLUFS相当です。標準Web Audio配列のmono/stereo/quad/5.1に対応し、5.1のLFEはLoudness計算から除外します。他のチャンネル構成では方式を勝手にRMSへ変更せず、GAIN MATCH不可と表示します。通常の読み込み・再生は維持します。'],
    ['AIR REC / GAIN MATCH','スピーカー位置・部屋・リスニング位置・ルームチューニング等の変化を、観測信号そのものの実効レベルで比較します。K-weightingを使わず、既存のRMS包絡から400 msブロック・100 ms間隔のenergyを集計します。同期後、A/B両方が有効な同じブロックだけを使います。',
      '各側で−60 dBFSとブロックenergyの90パーセンタイルより−30 dBのうち高い方を閾値とし、無音・極低レベル区間を除外します。目的音と環境ノイズの完全な分離はできません。一定の環境ノイズや録音機器のAGCが結果に影響することがあります。レベルは校正された音圧（dB SPL）ではなく、全チャンネル平均のdBFS RMSです。',
      '録音されたレベル差自体にも意味があるため、「GAIN MATCH ?」でA/B ORIGINALとMATCH OFFSETをON/OFFどちらでも確認できます。ONでも元の解析値と音声を保持します。OFFでは20 msのクリック防止遷移後、補正係数は正確に1（0 dB）へ戻ります。SAVE AUDIOは補正前の元データを保存します。'],
    ['自動判定・再計算・負荷','ファイル選択で入れた音声はFILE、Tool内で録音した音声はAIR RECとしてスロットごとに記録します。ファイル名では判定しません。片側だけAIR RECの場合も、観測録音を含むためAIR REC方式で両側を比較し、「混在」と表示します。保存した録音をファイルから開いた場合は由来を確実に判別できないためFILE扱いです。',
      'AUTO/MANUAL SYNCや音源を変更したら、現在の共通区間で補正量を更新します。有効音がない場合や共通区間が400 ms未満なら補正せずOFFにします。GAIN MATCHの変更は再生だけに作用し、同期位置・解析グラフ・メモ・保存音声を変更しません。読み込み時にWorkerでK-filter計算を追加しますが、全体の再デコードはせず、保持する追加energyは13分で音源あたり約0.6 MiBです。'],
    ['AUTO SYNC','音量変化の包絡の相関から開始位置を推定します。位相や波形の完全一致を保証する機能ではありません。無音・一定音・繰り返し・異なる音源などでは確定できない場合があります。推定条件と結果はSYNC画面に表示します。耳と波形で確認してください。'],
    ['MANUAL SYNC','Bの読出し位置からAの読出し位置を引いた値をmsで指定します。正の値ではBを先へ読み出します。±1/±10 msボタンで微調整できます。共通再生区間がなくなる設定は適用しません。同期変更後はGAIN MATCHも再計算します。'],
    ['DIFF FOCUS','原音の平均スペクトルのB−A差を1/3オクターブ帯域で表示し、絶対差が大きい最大3帯域を強調します。音源全体から分散抽出した最大64箇所の解析で、GAIN MATCH補正後でも同期後共通区間だけの再解析でもありません。片側でも−100 dBFS以下、または両側で扱えない高域は除外します。音の優劣や原因を自動判定しません。']
  ];
  for(const [title,...paragraphs]of sections){const section=element('section');const h=document.createElement('h3');h.textContent=title;section.append(h);for(const text of paragraphs){const p=document.createElement('p');p.textContent=text;section.append(p)}about.querySelector('.dialog-body').append(section)}
  const sourceDialog=addDialog('sourceDialog','A / B SOURCES');sourceDialog.querySelector('.dialog-body').append(filesCard);
  const syncDialog=addDialog('syncDialog','SYNC');syncDialog.querySelector('.dialog-body').append(syncCard);helpFooter(syncCard,'同期');
  filesCard.querySelector('h1').hidden=true;
  const graphDialog=addDialog('graphDialog','GRAPH');graphDialog.querySelector('.dialog-body').id='graphHost';
  graphDialog.addEventListener('close',restoreGraph);
  const nav=document.querySelector('nav.tabs'),oldLive=nav.querySelector('[data-page=live]');
  oldLive.remove();const diffTab=element('button',{class:'tab','data-page':'diff'},'DIFF');nav.insertBefore(diffTab,nav.querySelector('[data-page=history]'));
  nav.querySelector('[data-page=history]').textContent='MEMO';nav.querySelector('[data-page=compare]').textContent='COMPARE';
  const navWrap=element('div',{class:'workspace-nav'},'<button id="prevPage" class="alt pager" aria-label="前の画面">←</button><button id="nextPage" class="alt pager" aria-label="次の画面">→</button>');
  nav.before(navWrap);navWrap.insertBefore(nav,$('nextPage'));
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>changePage(b.dataset.page));
  $('prevPage').onclick=()=>stepPage(-1);$('nextPage').onclick=()=>stepPage(1);
  $('status').classList.add('workspace-status');
  const ribbon=element('div',{class:'source-ribbon'},'<button class="alt source-summary" data-source="A"><b>A</b><span id="summaryA">音源を選択</span></button><button class="alt source-summary" data-source="B"><b>B</b><span id="summaryB">音源を選択</span></button><button class="help-button" aria-label="Toolの説明">?</button>');
  $('status').before(ribbon);ribbon.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>openDialog('sourceDialog'));ribbon.querySelector('.help-button').onclick=()=>showHelp('Tool');
  // Move the original transport and seek controls to one shared dock.
  const dock=element('div',{id:'transportDock',class:'transport-dock'});
  for(const el of [filesCard.querySelector('.transport'),$('now'),filesCard.querySelector('.seeklabel'),$('seek')])dock.append(el);
  dock.append(element('div',{class:'secondary-controls'},'<button id="openSync" class="alt">SYNC</button><button id="gainToggle" class="alt" aria-pressed="false">GAIN MATCH OFF</button><button id="openLive" class="alt">AIR REC</button>'));
  dock.append(element('p',{id:'gainCaption',class:'gain-caption'},'原音で比較'));
  compare.after(dock);helpFooter(filesCard,'ファイルと再生');
  $('openSync').onclick=()=>openDialog('syncDialog');$('openLive').onclick=()=>changePage('live');
  // Keep both original graphs, showing one at a time at full available width.
  visualCard.querySelector('h2').hidden=true;visualCard.querySelectorAll('h3').forEach(e=>e.hidden=true);
  const heading=element('div',{class:'graph-heading'},'<h1>VISUAL COMPARE</h1><div class="graph-tools"><button id="expandCompare" class="alt">全画面 ⛶</button></div>');visualCard.prepend(heading);
  const graphTabs=element('div',{class:'graph-tabs'},'<button class="alt" data-graph="spectrum" aria-pressed="true">FREQUENCY</button><button class="alt" data-graph="wave" aria-pressed="false">WAVEFORM</button>');heading.after(graphTabs);
  graphTabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{compareView=b.dataset.graph;updateWorkspace();draw()});
  for(const id of ['wave','spectrum'])$(id).parentElement.classList.add('workspace-chart');
  const format=element('div',{id:'graphFormat',class:'graph-format'});format.append(visualCard.querySelector('label[for=freqMode]'),$('freqMode'));graphTabs.append(format);
  visualCard.append(element('p',{class:'graph-scope'},'原音解析 · 全体から分散抽出'));graphHelp(visualCard,'解析');
  $('expandCompare').onclick=()=>expandGraph(compareView,compareView==='wave'?'WAVEFORM · A/B':'FREQUENCY · A/B');
  const diff=element('section',{'data-panel':'diff',hidden:''},'<div class="card"><div class="graph-heading"><h2>DIFF FOCUS</h2><div class="graph-tools"><button id="expandDiff" class="alt">全画面 ⛶</button></div></div><p class="graph-scope">原音の平均スペクトル差 / B − A · dB</p><div class="chartbox workspace-chart"><canvas id="diffChart" aria-label="AとBの周波数差分"></canvas></div><div id="diffFocus" class="diff-focus"></div><p id="diffMessage" class="diff-message"></p></div>');
  compare.after(diff);helpText.DIFF=['同じ1/3オクターブ帯域内の平均スペクトルパワーを比較します。正の差はBが大きい、負の差はAが大きいことを示します。音の優劣や原因を判定する機能ではありません。','解析対象は各音源全体から分散抽出した最大64箇所です。同期後の共通区間だけを再解析した結果ではありません。GAIN MATCHの再生補正はこの原音グラフへ適用しません。','両方のサンプルレートで有効な帯域を比較します。片側でも解析値が−100 dBFS以下の帯域は差分候補から除外します。差が大きい最大3帯域を表示し、タップで強調できます。'];helpFooter(diff.firstElementChild,'DIFF');$('expandDiff').onclick=()=>expandGraph('diffChart','DIFF FOCUS · B − A');
  // Memo and the inherited reference viewer are separate subviews, never stacked.
  const memoTabs=element('div',{class:'memo-tabs'},'<button class="alt" data-memo="memo" aria-pressed="true">MEMO</button><button class="alt" data-memo="reference" aria-pressed="false">REFERENCE</button>');history.prepend(memoTabs);
  const historyCards=history.querySelectorAll(':scope > .card');historyCards[0].id='memoCard';historyCards[1].id='referenceCard';
  memoTabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{memoView=b.dataset.memo;updateWorkspace();draw()});
  helpFooter(historyCards[0],'MEMO / REFERENCE');helpFooter(historyCards[1],'MEMO / REFERENCE');
  const expandReference=element('button',{class:'alt'},'全画面 ⛶');historyCards[1].prepend(expandReference);expandReference.onclick=()=>expandGraph('referenceChart','REFERENCE');
  live.classList.add('live-workspace');const liveHead=element('div',{class:'workspace-heading'},'<button id="leaveLive" class="alt">← 比較に戻る</button><button id="expandLive" class="alt">全画面 ⛶</button>');live.prepend(liveHead);$('leaveLive').onclick=()=>changePage(returnPage);$('expandLive').onclick=()=>expandGraph('liveChart','LIVE / AIR REC');helpFooter(live.firstElementChild.nextElementSibling,'AIR REC');
  // Dialog focus stays managed by native <dialog>; no history or swipe handlers.
  document.querySelectorAll('[id^=air]').forEach(b=>{if(b.tagName==='BUTTON')b.addEventListener('click',()=>sourceDialog.close())});
  $('gainToggle').onclick=toggleGainMatch;
  updateWorkspace();
}
function showWorkspacePage(p){
  if(![...workspacePages,'live'].includes(p))return;
  if(p==='live'&&activePage!=='live')returnPage=activePage;
  activePage=p;document.querySelectorAll('[data-panel]').forEach(el=>el.hidden=el.dataset.panel!==p);
  document.querySelectorAll('[data-page]').forEach(el=>{el.classList.toggle('on',el.dataset.page===p);if(el.dataset.page===p)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  updateWorkspace();draw();
}
function stepPage(direction){const i=workspacePages.indexOf(activePage);changePage(workspacePages[Math.max(0,Math.min(2,(i<0?0:i)+direction))])}
function updateWorkspace(){
  if(!$('transportDock'))return;
  for(const k of ['A','B'])$('summary'+k).textContent=busy[k]?'読み込み中…':slots[k]?.name||'音源を選択';
  const i=workspacePages.indexOf(activePage);$('prevPage').disabled=i<=0;$('nextPage').disabled=i===2;
  $('transportDock').hidden=!['compare','diff'].includes(activePage);
  for(const id of ['wave','spectrum'])if(fullGraph?.id!==id)$(id).parentElement.hidden=id!==compareView;
  document.querySelectorAll('[data-graph]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.graph===compareView)));
  $('graphFormat').hidden=compareView!=='spectrum';$('memoCard').hidden=memoView!=='memo';$('referenceCard').hidden=memoView!=='reference';
  document.querySelectorAll('[data-memo]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.memo===memoView)));
  refreshGainMatch();
}
function expandGraph(id,title){
  if(fullGraph)return;const box=$(id).parentElement,marker=document.createComment('graph-home');box.before(marker);
  fullGraph={id,box,marker,trigger:document.activeElement};box.hidden=false;$('graphHost').append(box);
  $('graphDialog').querySelector('h2').textContent=title;openDialog('graphDialog');draw();
}
function restoreGraph(){
  if(!fullGraph)return;const {box,marker,trigger}=fullGraph;marker.replaceWith(box);fullGraph=null;updateWorkspace();draw();trigger?.focus();
}
