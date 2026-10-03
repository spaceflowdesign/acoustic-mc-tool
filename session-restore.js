// Local-only source/session persistence. No network or server storage.
const sessionVault={db:null,currentWrite:Promise.resolve(),restoring:false};
function sessionDB(){
  if(sessionVault.db)return Promise.resolve(sessionVault.db);
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('amct_session_v1',1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('sources',{keyPath:'id'});db.createObjectStore('state',{keyPath:'id'});};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{sessionVault.db=request.result;sessionVault.db.onversionchange=()=>{sessionVault.db.close();sessionVault.db=null;};resolve(sessionVault.db);};
  });
}
function sessionTx(db,stores,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);try{work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('端末内セッション保存に失敗しました'));});}
async function persistSlotSource(k){
  const s=slots[k];if(!s?.blob)return null;
  if(s.restoreSourceId)return s.restoreSourceId;
  const id=crypto.randomUUID(),record={id,name:s.name,inputKind:s.inputKind||'file',blob:s.blob,date:new Date().toISOString()};
  const db=await sessionDB();await sessionTx(db,['sources'],'readwrite',tx=>tx.objectStore('sources').put(record));s.restoreSourceId=id;return id;
}
function sessionSnapshot(){
  return {version:1,A:slots.A?.restoreSourceId||null,B:slots.B?.restoreSourceId||null,offset,gainEnabled,smoothingOct,freqMode:$('freqMode')?.value||'music',cursor:position(),savedAt:new Date().toISOString()};
}
async function persistSessionState(){
  if(sessionVault.restoring)return;
  try{
    await Promise.all(['A','B'].map(k=>slots[k]?persistSlotSource(k):null));
    const db=await sessionDB(),state={id:'current',...sessionSnapshot()};
    await sessionTx(db,['state'],'readwrite',tx=>tx.objectStore('state').put(state));
  }catch(error){if($('status'))say('現在のA/Bは使用できますが、再読込用の端末保存に失敗しました：'+error.message);}
}
function queueSessionSave(){sessionVault.currentWrite=sessionVault.currentWrite.then(()=>persistSessionState()).catch(()=>{});return sessionVault.currentWrite;}
async function getSessionSource(id){if(!id)return null;const db=await sessionDB();return new Promise((resolve,reject)=>{const req=db.transaction('sources').objectStore('sources').get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
async function getCurrentSession(){const db=await sessionDB();return new Promise((resolve,reject)=>{const req=db.transaction('state').objectStore('state').get('current');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
async function restoreSessionState(state,{announce=true}={}){
  if(!state)return false;sessionVault.restoring=true;
  try{
    pause(true);
    for(const k of ['A','B']){
      const id=state[k],source=await getSessionSource(id);
      if(!source){if(id)throw Error(k+'の保存元ファイルが端末内に見つかりません');continue;}
      await originalSessionLoadBlob(k,source.blob,source.name,source.inputKind);if(slots[k])slots[k].restoreSourceId=id;
    }
    if(slots.A&&slots.B&&Number.isFinite(state.offset))originalSessionSetOffset(state.offset*1000);
    if($('freqMode')&&state.freqMode){$('freqMode').value=state.freqMode;}
    if($('smoothing')&&Number.isFinite(state.smoothingOct)){$('smoothing').value=String(state.smoothingOct);$('smoothing').dispatchEvent(new Event('change'));}
    refreshGainMatch();if(!!state.gainEnabled!==gainEnabled&&gainResult?.valid)originalSessionToggleGain();
    const [lo,hi]=limits();cursor=Math.max(lo,Math.min(Number.isFinite(state.cursor)?state.cursor:lo,hi));update();draw();if(typeof refreshAnalysisNotes==='function')refreshAnalysisNotes();
    if(announce)say('保存したA/B・SYNC・GAIN MATCH・表示条件を端末内データから復帰しました。');
    return true;
  }finally{sessionVault.restoring=false;queueSessionSave();}
}
async function restoreLastSession(){
  try{const state=await getCurrentSession();if(state?.A||state?.B)await restoreSessionState(state,{announce:false});}
  catch(error){if($('status'))say('前回セッションを自動復帰できませんでした：'+error.message);}
}
const originalSessionLoadBlob=loadBlob;
loadBlob=function(k,blob,name,inputKind='file'){return originalSessionLoadBlob(k,blob,name,inputKind).then(async value=>{if(slots[k]?.blob===blob){await persistSlotSource(k);await queueSessionSave();}return value;});};
const originalSessionSetOffset=setOffset;
setOffset=function(v){const result=originalSessionSetOffset(v);queueSessionSave();return result;};
const originalSessionToggleGain=toggleGainMatch;
toggleGainMatch=function(){const result=originalSessionToggleGain();queueSessionSave();return result;};
document.addEventListener('change',e=>{if(e.target?.id==='smoothing'||e.target?.id==='freqMode')queueSessionSave();});
document.addEventListener('click',e=>{if(e.target?.id==='clearA'||e.target?.id==='clearB')setTimeout(()=>queueSessionSave(),0);});
window.addEventListener('pagehide',()=>{void queueSessionSave();});
const sessionInit=initWorkspace;
initWorkspace=function(){sessionInit();queueMicrotask(()=>void restoreLastSession());};
