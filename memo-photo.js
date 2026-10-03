const memoPhotos={db:null,draft:[],urls:[],viewUrls:[],saving:false};
function memoDB(){if(memoPhotos.db)return Promise.resolve(memoPhotos.db);return new Promise((resolve,reject)=>{const request=indexedDB.open('amct_memo_photos_v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'id'});request.result.createObjectStore('photos');};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('別のタブが写真保存を使用しています'));request.onsuccess=()=>{memoPhotos.db=request.result;memoPhotos.db.onversionchange=()=>{memoPhotos.db.close();memoPhotos.db=null;};resolve(memoPhotos.db);};});}
function memoTransaction(db,stores,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);try{work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('写真保存を中断しました'));});}
function photoImage(photo,urls){const url=URL.createObjectURL(photo.blob);urls.push(url);const figure=element('figure'),img=element('img',{src:url,alt:photo.name||'添付写真',loading:'lazy'}),caption=element('figcaption');caption.textContent=photo.name||'添付写真';img.onerror=()=>{img.hidden=true;caption.textContent+='（このブラウザでは表示できない形式です。元画像は保存されています）';};const link=element('a',{href:url,download:photo.name||'photo'},'元画像を保存');figure.append(img,caption,link);return figure;}
function renderDraftPhotos(){for(const url of memoPhotos.urls)URL.revokeObjectURL(url);memoPhotos.urls=[];const host=$('draftPhotos');host.replaceChildren();memoPhotos.draft.forEach((photo,i)=>{const figure=photoImage(photo,memoPhotos.urls);figure.append(makeAction('添付を外す',()=>{memoPhotos.draft.splice(i,1);renderDraftPhotos();}));host.append(figure);});}
async function addMemoPhotos(files){
  for(const file of files){if(!file.size){$('photoStatus').textContent='空の画像は追加できません。';continue;}if(!/^image\//i.test(file.type)&&! /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name)){$('photoStatus').textContent='画像ファイルを選択してください。';continue;}
    if(memoPhotos.draft.length>=10||file.size>25*1024*1024){$('photoStatus').textContent='端末負荷を抑えるため1記録10枚、1枚25 MiBまでです。分けて保存してください。';break;}
    memoPhotos.draft.push({name:file.name||'photo',blob:file});$('photoStatus').textContent='写真を追加しました。「記録を保存」でA/Bの特徴・メモと一緒に保存します。';
  }renderDraftPhotos();
}
async function saveMemoRecord(){
  if(memoPhotos.saving)return;memoPhotos.saving=true;$('saveMemoRecord').disabled=true;
  const id=crypto.randomUUID(),photos=[...memoPhotos.draft],record={id,date:new Date().toISOString(),featureA:$('featureA')?.value||'',featureB:$('featureB')?.value||'',memo:$('memo').value,photos:photos.map((p,i)=>({key:id+':'+i,name:p.name}))};
  try{const db=await memoDB();await memoTransaction(db,['records','photos'],'readwrite',tx=>{tx.objectStore('records').put(record);photos.forEach((p,i)=>tx.objectStore('photos').put(p.blob,id+':'+i));});memoPhotos.draft=memoPhotos.draft.filter(p=>!photos.includes(p));renderDraftPhotos();$('photoStatus').textContent='メモと写真を同じ記録として端末内に保存しました。';await listMemoRecords();return record;}
  catch(error){$('photoStatus').textContent='保存できません。メモと添付は画面に保持しています：'+error.message;return null;}
  finally{memoPhotos.saving=false;$('saveMemoRecord').disabled=false;}
}
async function listMemoRecords(){try{const db=await memoDB(),records=await new Promise((resolve,reject)=>{const req=db.transaction('records').objectStore('records').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});const host=$('memoRecords');host.replaceChildren();for(const r of records.sort((a,b)=>b.date.localeCompare(a.date)))host.append(makeAction(new Date(r.date).toLocaleString()+' · 写真 '+r.photos.length+'枚',()=>openMemoRecord(r),{'data-record-id':r.id}));}catch(error){$('photoStatus').textContent='写真付き記録を開けません：'+error.message;}}
let photoViewGeneration=0;
async function openMemoRecord(record){
  const generation=++photoViewGeneration;for(const url of memoPhotos.viewUrls)URL.revokeObjectURL(url);memoPhotos.viewUrls=[];const host=$('memoRecordDialog').querySelector('.dialog-body');host.replaceChildren();const text=element('pre',{class:'saved-memo'});text.textContent=new Date(record.date).toLocaleString()+'\n\nAの特徴\n'+(record.featureA||'—')+'\n\nBの特徴\n'+(record.featureB||'—')+'\n\nMEMO\n'+(record.memo||'—');host.append(text);openDialog('memoRecordDialog');
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
  const memo= $('memo');const featureBox=element('div',{class:'ab-feature-notes'},'<div class="feature-note feature-a"><label for="featureA"><b>A</b> 比較した特徴</label><textarea id="featureA" rows="4" placeholder="例：低域が締まっている / ボーカルが近い / 高域が柔らかい"></textarea></div><div class="feature-note feature-b"><label for="featureB"><b>B</b> 比較した特徴</label><textarea id="featureB" rows="4" placeholder="例：低域が広がる / 奥行きが出る / 高域が明るい"></textarea></div></div>');
  memo.before(featureBox);
  const picker=element('div',{class:'photo-actions'},'<button id="photoCamera" class="alt">カメラで写真撮影</button><button id="photoLibrary" class="alt">写真ライブラリから追加</button><input id="cameraPhotoInput" type="file" accept="image/*" capture="environment" hidden><input id="libraryPhotoInput" type="file" accept="image/*" multiple hidden><button id="saveMemoRecord" class="alt">記録を保存</button>');card.append(picker,element('p',{id:'photoStatus',role:'status'},'写真は「記録を保存」でA/Bの特徴・メモ・日時を一緒に保存します。'),element('div',{id:'draftPhotos',class:'photo-grid'}),element('h3',{},'保存した記録'),element('div',{id:'memoRecords'}));
  for(const [button,input]of [['photoCamera','cameraPhotoInput'],['photoLibrary','libraryPhotoInput']]){$(button).onclick=()=>$(input).click();$(input).onchange=async e=>{const files=Array.from(e.target.files||[]);try{await addMemoPhotos(files);}finally{e.target.value='';}};}
  $('saveMemoRecord').onclick=saveMemoRecord;addDialog('memoRecordDialog','MEMO + PHOTO').addEventListener('close',()=>{photoViewGeneration++;for(const url of memoPhotos.viewUrls)URL.revokeObjectURL(url);memoPhotos.viewUrls=[];});void listMemoRecords();
};
