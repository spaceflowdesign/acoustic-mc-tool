// Local-only evidence: no filename, user agent or error is uploaded automatically.
const inputEvents=[],pickerFlights=new Map();
function recordInput(side,event,details={}){
  inputEvents.push({at:new Date().toISOString(),side,event,...details});if(inputEvents.length>40)inputEvents.shift();
  if($('inputLog'))$('inputLog').value=JSON.stringify({build:'2026-09-30-input-v2',userAgent:navigator.userAgent,events:inputEvents},null,2);
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
  const details=element('details',{},'<summary>入力診断（端末内のみ）</summary><p>反映されない場合、最後のイベント・形式・エラーを確認できます。ファイル名を含むため、共有前に内容を確認してください。OSがファイルを渡していない場合は解析できません。</p><textarea id="inputLog" rows="8" readonly aria-label="入力診断ログ"></textarea>');
  $('sourceDialog').querySelector('.dialog-body').append(details);recordInput('-','準備');
  for(const side of ['A','B']){const input=$('file'+side);input.onchange=e=>receivePickedFile(side,e);input.oninput=e=>receivePickedFile(side,e);input.addEventListener('click',()=>recordInput(side,'pickerを開く'));input.addEventListener('cancel',()=>recordInput(side,'pickerキャンセル'));}
};
