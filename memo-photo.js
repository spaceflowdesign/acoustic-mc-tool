const memoPhotos={db:null,draft:[],urls:[],viewUrls:[],saving:false};
const BUG_REPORT_EMAIL=['spaceflowdesign.jp','gmail.com'].join('@');
function bugReportState(){return {at:new Date().toISOString(),userAgent:navigator.userAgent,page:activePage,A:slots.A?{name:slots.A.name,type:slots.A.blob?.type||'',size:slots.A.blob?.size||0,inputKind:slots.A.inputKind||'file'}:null,B:slots.B?{name:slots.B.name,type:slots.B.blob?.type||'',size:slots.B.blob?.size||0,inputKind:slots.B.inputKind||'file'}:null,syncMs:Number.isFinite(offset)?Number((offset*1000).toFixed(1)):null,gainMatch:gainEnabled?'ON':'OFF',frequencyMode:$('freqMode')?.value||null,smoothing:Number.isFinite(smoothingOct)?smoothingOct:null,recentInputDiagnostics:inputEvents.slice(-16)};}
function buildBugReportBody(symptom){return ['Acoustic M.C Tool 不具合報告','','【発生内容】',symptom.trim()||'（未入力）','','【USER MEMO】',$('memo')?.value?.trim()||'（なし）','','【診断情報】',JSON.stringify(bugReportState(),null,2),'','※ ファイル名・端末/ブラウザ情報が含まれる場合があります。','※ 音声・動画本体は自動添付されません。'].join('\n');}
function openBugReportMail(){const symptom=$('bugReportSymptom')?.value||'';if(!symptom.trim()){$('bugReportStatus').textContent='発生した症状を入力してください。';$('bugReportSymptom').focus();return;}const subject='[Acoustic M.C Tool] 不具合報告',body=buildBugReportBody(symptom);$('bugReportStatus').textContent='メール作成画面を開きます。内容を確認して送信してください。';location.href='mail'+'to:'+BUG_REPORT_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);}
function analysisBandName(row){return bandLabel(row)}
function analysisContext(meta){
  const smoothing=meta.mode==='standard'?'1/3 Oct 固定':meta.width?'1/'+Math.round(1/meta.width)+' Oct':'OFF';
  const gain=(Math.abs(meta.matchA)>1e-9||Math.abs(meta.matchB)>1e-9)?'GAIN MATCH ON':'GAIN MATCH OFF';
  return gain+' / '+(meta.mode==='standard'?'STANDARD':'MUSIC')+' / Smoothing '+smoothing;
}
function buildSideAnalysis(rows,side,context){
  const selected=rows.filter(r=>side==='A'?r.delta<=-.5:r.delta>=.5).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3);
  const other=side==='A'?'B':'A';
  if(!selected.length)return context+'\n'+other+'との差が0.5 dB以上の主要帯域はありません。';
  return context+'\n'+selected.map(r=>analysisBandName(r)+'：'+other+'より +'+Math.abs(r.delta).toFixed(1)+' dB').join('\n');
}
function currentAnalysisNotes(){
  if(!slots.A||!slots.B)return {A:'A/Bを読み込むとAcoustic M.Cが比較結果を書き出します。',B:'A/Bを読み込むとAcoustic M.Cが比較結果を書き出します。'};
  const data=diffDisplayData(slots.A,slots.B),rows=data.rows.filter(r=>Number.isFinite(r.delta)),context=analysisContext(data.meta);
  if(!rows.length)return {A:context+'\n比較可能な有音帯域がありません。',B:context+'\n比較可能な有音帯域がありません。'};
  return {A:buildSideAnalysis(rows,'A',context),B:buildSideAnalysis(rows,'B',context)};
}
function refreshAnalysisNotes(){
  if(!$('analysisA')||!$('analysisB'))return;
  const notes=currentAnalysisNotes();$('analysisA').value=notes.A;$('analysisB').value=notes.B;
}
function memoDB(){if(memoPhotos.db)return Promise.resolve(memoPhotos.db);return new Promise((resolve,reject)=>{const request=indexedDB.open('amct_memo_photos_v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'id'});request.result.createObjectStore('photos');};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('別のタブが写真保存を使用しています'));request.onsuccess=()=>{memoPhotos.db=request.result;memoPhotos.db.onversionchange=()=>{memoPhotos.db.close();memoPhotos.db=null;};resolve(memoPhotos.db);};});}
function memoTransaction(db,stores,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);try{work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('写真保存を中断しました'));});}
function photoImage(photo,urls){const url=URL.createObjectURL(photo.blob);urls.push(url);const figure=element('figure'),img=element('img',{src:url,alt:photo.name||'添付写真',loading:'lazy'}),caption=element('figcaption');caption.textContent=photo.name||'添付写真';img.onerror=()=>{img.hidden=true;caption.textContent+='（このブラウザでは表示できない形式です。元画像は保存されています）';};const link=element('a',{href:url,download:photo.name||'photo'},'元画像を保存');figure.append(img,caption,link);return figure;}
function renderDraftPhotos(){for(const url of memoPhotos.urls)URL.revokeObjectURL(url);memoPhotos.urls=[];const host=$('draftPhotos');host.replaceChildren();memoPhotos.draft.forEach((photo,i)=>{const figure=photoImage(photo,memoPhotos.urls);figure.append(makeAction('添付を外す',()=>{memoPhotos.draft.splice(i,1);renderDraftPhotos();}));host.append(figure);});}
async function addMemoPhotos(files){
  for(const file of files){if(!file.size){$('photoStatus').textContent='空の画像は追加できません。';continue;}if(!/^image\//i.test(file.type)&&! /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name)){$('photoStatus').textContent='画像ファイルを選択してください。';continue;}
    if(memoPhotos.draft.length>=10||file.size>25*1024*1024){$('photoStatus').textContent='端末負荷を抑えるため1記録10枚、1枚25 MiBまでです。分けて保存してください。';break;}
    memoPhotos.draft.push({name:file.name||'photo',blob:file});$('photoStatus').textContent='写真を追加しました。「記録を保存」でA/B解析・USER MEMOと一緒に保存します。';
  }renderDraftPhotos();
}
async function saveMemoRecord(){
  if(memoPhotos.saving)return;memoPhotos.saving=true;$('saveMemoRecord').disabled=true;
  await queueSessionSave();
  const id=crypto.randomUUID(),photos=[...memoPhotos.draft],notes=currentAnalysisNotes(),session=sessionSnapshot(),record={id,date:new Date().toISOString(),analysisA:notes.A,analysisB:notes.B,memo:$('memo').value,session,photos:photos.map((p,i)=>({key:id+':'+i,name:p.name}))};
  try{const db=await memoDB();await memoTransaction(db,['records','photos'],'readwrite',tx=>{tx.objectStore('records').put(record);photos.forEach((p,i)=>tx.objectStore('photos').put(p.blob,id+':'+i));});memoPhotos.draft=memoPhotos.draft.filter(p=>!photos.includes(p));renderDraftPhotos();$('photoStatus').textContent='A/B解析・USER MEMO・写真を同じ記録として端末内に保存しました。';await listMemoRecords();return record;}
  catch(error){$('photoStatus').textContent='保存できません。メモと添付は画面に保持しています：'+error.message;return null;}
  finally{memoPhotos.saving=false;$('saveMemoRecord').disabled=false;}
}
async function listMemoRecords(){try{const db=await memoDB(),records=await new Promise((resolve,reject)=>{const req=db.transaction('records').objectStore('records').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});const host=$('memoRecords');host.replaceChildren();for(const r of records.sort((a,b)=>b.date.localeCompare(a.date)))host.append(makeAction(new Date(r.date).toLocaleString()+' · 写真 '+r.photos.length+'枚',()=>openMemoRecord(r),{'data-record-id':r.id}));}catch(error){$('photoStatus').textContent='写真付き記録を開けません：'+error.message;}}
let photoViewGeneration=0;
async function openMemoRecord(record){
  const generation=++photoViewGeneration;for(const url of memoPhotos.viewUrls)URL.revokeObjectURL(url);memoPhotos.viewUrls=[];const host=$('memoRecordDialog').querySelector('.dialog-body');host.replaceChildren();const text=element('pre',{class:'saved-memo'});text.textContent=new Date(record.date).toLocaleString()+'\n\nA · Acoustic M.C ANALYSIS\n'+(record.analysisA||record.featureA||'—')+'\n\nB · Acoustic M.C ANALYSIS\n'+(record.analysisB||record.featureB||'—')+'\n\nUSER MEMO\n'+(record.memo||'—');host.append(text);
  if(record.session?.A||record.session?.B){const restore=makeAction('この記録のA/B状態を復帰',async()=>{restore.disabled=true;try{await restoreSessionState(record.session);$('memo').value=record.memo||'';try{sessionStorage.setItem('amct_memo_v1',$('memo').value)}catch{}refreshAnalysisNotes();$('memoRecordDialog').close();changePage('compare');}catch(error){restore.disabled=false;host.append(element('p',{class:'restore-error'},'復帰できません：'+error.message));}});host.append(restore);}
  else host.append(element('p',{class:'analysis-note'},'この記録は旧形式のためA/B状態の復帰情報はありません。'));
  openDialog('memoRecordDialog');
  try{const db=await memoDB();for(const p of record.photos){const blob=await new Promise((resolve,reject)=>{const req=db.transaction('photos').objectStore('photos').get(p.key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(generation!==photoViewGeneration)return;if(blob)host.append(photoImage({name:p.name,blob},memoPhotos.viewUrls));else host.append(element('p',{},'写真データが見つかりません。'));}}
  catch(error){if(generation===photoViewGeneration)host.append(element('p',{},'写真を開けません：'+error.message));}
}
const photoInit=initWorkspace;
initWorkspace=function(){photoInit();
  // Remove REFERENCE only from MEMO. Keep its existing canvas/viewer accessible
  // through AIR REC and leave SAVE REFERENCE/storage keys untouched.
  document.querySelector('.memo-tabs').remove();const viewer=addDialog('referenceDialog','SAVED REFERENCE');viewer.querySelector('.dialog-body').append($('referenceCard'));
  $('saveReference').after(makeAction('保存済みREFERENCEを見る',()=>{openDialog('referenceDialog');$('referenceCard').hidden=false;draw();}));
  const card=$('memoCard');card.querySelector('h2').textContent='MEMO + PHOTO';card.querySelector('.help-button').setAttribute('aria-label','MEMO + PHOTOの説明');
  const memo=$('memo');const featureBox=element('div',{class:'ab-feature-notes'},'<div class="feature-note feature-a"><label for="analysisA"><b>A</b> Acoustic M.C ANALYSIS</label><textarea id="analysisA" rows="5" readonly aria-readonly="true"></textarea></div><div class="feature-note feature-b"><label for="analysisB"><b>B</b> Acoustic M.C ANALYSIS</label><textarea id="analysisB" rows="5" readonly aria-readonly="true"></textarea></div></div><p class="analysis-note">Acoustic M.CがDIFFの相対差を測定値として要約します。音の優劣や原因は判定しません。</p>');
  memo.before(featureBox);const memoLabel=card.querySelector('label[for="memo"]');if(memoLabel)memoLabel.textContent='USER MEMO / ユーザーメモ';memo.setAttribute('placeholder','聴感・変更内容・比較条件などを自由に記録');refreshAnalysisNotes();
  const reportButton=makeAction('不具合報告',()=>openDialog('bugReportDialog'),{id:'openBugReport',class:'alt'});const picker=element('div',{class:'photo-actions'},'<button id="photoCamera" class="alt">カメラで写真撮影</button><button id="photoLibrary" class="alt">写真ライブラリから追加</button><input id="cameraPhotoInput" type="file" accept="image/*" capture="environment" hidden><input id="libraryPhotoInput" type="file" accept="image/*" multiple hidden><button id="saveMemoRecord" class="alt">記録を保存</button>');card.append(reportButton,picker,element('p',{id:'photoStatus',role:'status'},'「記録を保存」でA/B解析・USER MEMO・写真・現在のA/B/SYNC/GAIN/表示条件を端末内に保存します。'),element('div',{id:'draftPhotos',class:'photo-grid'}),element('h3',{},'保存した記録'),element('div',{id:'memoRecords'}));const bugDialog=addDialog('bugReportDialog','不具合報告'),bugHost=bugDialog.querySelector('.dialog-body');bugHost.append(element('p',{class:'analysis-note'},'発生した症状だけ入力してください。入力診断・A/B状態・SYNC・GAIN MATCH・表示条件を端末内で自動整理し、SPACE FLOW DESIGN宛てメールへ入れます。音声・動画本体は自動添付しません。'),element('label',{for:'bugReportSymptom'},'発生した症状 / 操作'),element('textarea',{id:'bugReportSymptom',rows:'6',placeholder:'例：Bを再生してSEEKした後、DIFFが更新されなくなった'}),element('p',{class:'analysis-note'},'ファイル名・端末/ブラウザ情報が含まれる場合があります。メール作成画面で送信前に確認できます。'),makeAction('SFD宛てメールを作成',openBugReportMail,{id:'sendBugReport',class:'alt'}),element('p',{id:'bugReportStatus',role:'status',class:'analysis-note'}));
  for(const [button,input]of [['photoCamera','cameraPhotoInput'],['photoLibrary','libraryPhotoInput']]){$(button).onclick=()=>$(input).click();$(input).onchange=async e=>{const files=Array.from(e.target.files||[]);try{await addMemoPhotos(files);}finally{e.target.value='';}};}
  $('saveMemoRecord').onclick=saveMemoRecord;addDialog('memoRecordDialog','MEMO + PHOTO').addEventListener('close',()=>{photoViewGeneration++;for(const url of memoPhotos.viewUrls)URL.revokeObjectURL(url);memoPhotos.viewUrls=[];});void listMemoRecords();
};

const analysisShowWorkspacePage=showWorkspacePage;
showWorkspacePage=function(p){analysisShowWorkspacePage(p);if(p==='history')refreshAnalysisNotes();};
