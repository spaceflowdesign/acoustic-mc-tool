const beginnerTerms={
  'K-weighting':'低い音や高い音を人が同じ強さには感じないことを、音量の測定時だけ近似する重み付けです。Toolでは解析側だけに使い、聴く音にこのフィルターを掛けません。',
  'LUFS':'デジタル音声の「人にどれくらい大きく聞こえるか」を比較するための目盛りです。数値が大きいほど大きい傾向があります。部屋での実際の音圧を示す値ではありません。',
  'RMS':'波形のプラスとマイナスが打ち消し合わないようにして、一定時間の音の強さを平均する方法です。一瞬の最大値より、続いている音の大きさを捉えます。',
  'gating':'無音やとても小さい部分を音量の平均から外す仕組みです。休符が長いだけで音量が小さいと判定される影響を減らします。雑音と目的の音を完全に分ける機能ではありません。',
  'Smoothing':'隣り合う周波数の値をならしてグラフを読みやすくします。細かな山や谷は見えにくくなります。OFFならならしません。再生音は変わりません。',
  'FFT':'短い音の区間を、低音から高音までどの成分がどれだけあるかに分けて調べる計算です。解析する区間が有限なので、すべての細かな違いを分離できるわけではありません。',
  'SYNC offset':'AとBで音が始まる位置のずれです。Toolの正の値はBをその時間だけ先の位置から読む意味です。音量補正とは別の設定です。',
  'octave':'周波数が2倍になる幅です。100 Hzから200 Hzは1 octave。1/3や1/6は、その幅をさらに分けたものです。',
  'dBFS':'デジタル音声の最大値を基準にした音の強さの目盛りです。一般に0に近いほど大きく、負の数ほど小さくなります。マイクの録音値だけでは部屋の音圧は分かりません。'
};
const helpRoutes={
  LISTEN:{intro:'耳でA/Bを比較する画面です。動画入力時だけ映像も表示します。',topics:['ファイルと再生','同期','GAIN MATCH'],details:['PLAYで選択側を再生し、A/Bを切り替えて同じ共通区間を聴き比べます。波形・シークで位置を移動します。動画映像は選択側の音声時刻へ追従します。','REPEAT ONは同期後の共通区間を繰り返します。A/B・GAIN MATCH・SYNC offsetは維持します。切替時の読出し待ちを含むためギャップレス再生ではありません。','拡大は横画面の波形です。映像は隠すだけで再読込せず、音声出力経路は変更しません。']},
  COMPARE:{intro:'同じグラフ上でA/Bを見ながら比較します。',topics:['解析','GAIN MATCH','同期'],details:['再生中は同期した現在位置のFFT、停止時は全体から分散抽出した平均を表示します。音声の優劣を自動判定するものではありません。','MUSICのSmoothing初期値はOFFです。1/6・1/3 octaveを選べます。STANDARDは固定1/3 octaveで独立しています。表示の変更は再生音を加工しません。']},
  DIFF:{intro:'AとBのどの周波数が変化したかを確認する画面です。',topics:['解析'],details:['再生中は同じ共通時刻のA/BをFFTし、B − Aを表示します。正はBが大きく、負はAが大きいことを示します。停止中または解析待ちは明示した全体平均です。','COMPAREと同じSmoothingでA/Bのパワーをならしてから差を求めます。グラフと数値は同じ帯域集計結果を使います。MUSICはDefault/Customの6帯域、STANDARDは固定1/3 octave。GAIN MATCH後も原音の解析値です。','無音近傍や両側で解析できない高域は差分候補にしません。差が大きいことが良い音を意味するわけではありません。']},
  MEMO:{intro:'メモと写真を同じ日時の記録として残すMEMO + PHOTOです。',topics:[],details:['テキストの既存セッション保存は維持します。写真ライブラリ／カメラから画像を追加し「記録を保存」でメモと写真を一緒にこのブラウザへ保存します。','カメラは端末が対応する場合に背面カメラを要求します。Safariの権限と写真形式に依存します。表示できない写真も元ファイルを保存できます。','写真付き記録は端末内のIndexedDBです。ブラウザデータ消去や容量不足、プライベートモードでは保持できない場合があります。大切な写真は元データも保管してください。SAVE REFERENCEはAIR REC側に残っています。']}
};
let helpTrail=[];
function helpParagraph(text){const p=document.createElement('p'),pattern=new RegExp('('+Object.keys(beginnerTerms).join('|')+')','g');for(const part of text.split(pattern)){if(beginnerTerms[part])p.append(makeAction(part,()=>helpNavigate({term:part}),{class:'term-link'}));else p.append(document.createTextNode(part));}return p;}
function helpNavigate(state){helpTrail.push(state);renderHelpPage();}
function renderHelpPage(){
  const state=helpTrail[helpTrail.length-1],host=$('helpDialog').querySelector('.dialog-body');host.replaceChildren();
  $('helpDialog').querySelector('h2').textContent=state.term||state.topic;
  if(helpTrail.length>1)host.append(makeAction('← 前の説明',()=>{helpTrail.pop();renderHelpPage();}));
  if(state.term){host.append(helpParagraph(beginnerTerms[state.term]));return;}
  const topic=state.topic,route=helpRoutes[topic],texts=route?.details||helpText[topic]||['使い方はABOUTの一覧でも確認できます。'];
  if(!state.details){host.append(helpParagraph(route?.intro||texts.slice(0,3).join(' ')),makeAction('仕様・使い方・注意点を見る',()=>helpNavigate({topic,details:true})));}
  else{for(const text of texts)host.append(helpParagraph(text));if(topic==='GAIN MATCH')for(const section of $('aboutDialog').querySelectorAll('section'))if(/FILE比較|AIR REC \/ GAIN|自動判定/.test(section.querySelector('h3')?.textContent||''))host.append(helpParagraph(section.textContent));for(const related of route?.topics||[])host.append(makeAction(related+'とは？',()=>helpNavigate({topic:related})));}
  if(topic==='GAIN MATCH'){host.append(element('pre',{id:'gainLevels',class:'gain-levels'}));renderGainMatch();}
  host.append(makeAction('ABOUT / HOW IT WORKS 一覧',()=>openDialog('aboutDialog'),{class:'alt about-link'}));
}
showHelp=function(topic){const aliases={'Tool':activePage==='history'?'MEMO':activePage==='live'?'AIR REC':activePage.toUpperCase(),'MEMO / REFERENCE':'MEMO'};helpTrail=[{topic:aliases[topic]||topic}];renderHelpPage();openDialog('helpDialog');};
const helpInit=initWorkspace;
initWorkspace=function(){helpInit();
  for(const topic of ['AUTO SYNC','MANUAL SYNC']){const section=[...$('aboutDialog').querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent===topic);helpText[topic]=section?Array.from(section.querySelectorAll('p'),p=>p.textContent):[];}
  helpRoutes['同期']={intro:'A/Bで同じ出来事が同じ時刻に聞こえるよう位置を揃えます。',topics:['AUTO SYNC','MANUAL SYNC'],details:helpText['同期']};
  helpRoutes['解析']={intro:'音に含まれる周波数成分をグラフで確認します。表示を変えても再生音は変わりません。',topics:[],details:[...helpText['解析'],'Smoothingは表示専用です。FFTの区間と周波数分解能には限りがあります。']};
  helpText.DIFF=helpRoutes.DIFF.details;
  for(const section of $('aboutDialog').querySelectorAll('section'))if(section.querySelector('h3')?.textContent==='DIFF FOCUS'){section.replaceChildren(element('h3',{},'DIFF FOCUS'));for(const text of helpRoutes.DIFF.details)section.append(helpParagraph(text));}
  const host=$('aboutDialog').querySelector('.dialog-body'),index=element('nav',{'aria-label':'説明一覧'});host.prepend(index);
  for(const [topic,route]of Object.entries(helpRoutes)){const section=element('section',{id:'about-'+topic});section.append(element('h3',{},topic==='MEMO'?'MEMO + PHOTO':topic),helpParagraph(route.intro),makeAction(topic+'の説明を開く',()=>showHelp(topic)));host.append(section);index.append(makeAction(topic,()=>section.scrollIntoView({block:'start'})));}
  // Keep existing technical details, but make glossary terms reachable there too.
  for(const p of [...host.querySelectorAll('section > p')])if(!p.querySelector('button'))p.replaceWith(helpParagraph(p.textContent));
  helpFooter($('displayDialog').querySelector('.dialog-body'),'解析');
};
