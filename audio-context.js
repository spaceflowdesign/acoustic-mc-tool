// Output lifecycle only: assets, PCM store, analysis and alignment outlive ctx.
let audioFlight=null, audioEpoch=0, outputNeedsCheck=false;
function cancelAudioStart() {
  audioEpoch++;
  const pending=audioFlight;audioFlight=null;
  pending?.cancel?.();
}
function waitForOutput(context,flight,verifyClock) {
  return new Promise((resolve,reject)=>{
    let done=false;
    const initialTime=context.currentTime;
    const finish=error=>{
      if(done)return;done=true;
      clearTimeout(deadline);clearInterval(poll);
      context.removeEventListener('statechange',check);
      if(flight.cancel===cancel)flight.cancel=null;
      error?reject(error):resolve(context);
    };
    const check=()=>{
      if(flight.epoch!==audioEpoch||document.hidden)return finish(Error('音声出力の開始を中止しました。'));
      if(context.state==='closed')return finish(Error('音声出力が閉じられています。'));
      if(context.state==='running'&&(!verifyClock||context.currentTime>initialTime))finish();
    };
    const cancel=()=>finish(Error('音声出力の開始を中止しました。'));
    const deadline=setTimeout(()=>finish(Error('音声出力の復帰がタイムアウトしました。')),2500);
    const poll=setInterval(check,25);
    flight.cancel=cancel;context.addEventListener('statechange',check);
    // Call synchronously in the PLAY/REC gesture, for suspended *and* interrupted.
    // The promise may settle before statechange, or may never settle in Safari.
    try { Promise.resolve(context.resume()).then(check,error=>finish(error)); }
    catch(error) { finish(error); }
    check();
  });
}
function discardOutput(context) {
  if(rec)throw Error('録音中の音声出力は再作成できません。録音を停止してください。');
  // Save the cursor against the OLD clock before replacing it with a zero clock.
  cursor=position();playing=null;cut();origin=0;
  pcmStore.cache.clear(); // Only the bounded playback cache, never the PCM DB.
  if(ctx===context)ctx=null;
  try { if(context.state!=='closed')Promise.resolve(context.close()).catch(()=>{}); } catch{}
  update();draw();
}
function audio(resume=true) {
  const create=()=>new(window.AudioContext||window.webkitAudioContext)();
  // File/recording decode does not resume output or touch the user's position.
  if(!resume){if(!ctx)ctx=create();return Promise.resolve(ctx)}
  if(document.hidden)return Promise.reject(Error('ページを表示して再生ボタンを押してください。'));
  if(audioFlight)return audioFlight.promise;
  if(!ctx)ctx=create();
  if(ctx.state==='running'&&!outputNeedsCheck)return Promise.resolve(ctx);
  const flight={epoch:audioEpoch,cancel:null,promise:null};audioFlight=flight;
  flight.promise=(async()=>{
    let context=ctx;
    try {
      if(context.state==='closed')throw Error('closed');
      await waitForOutput(context,flight,true);
    } catch(error) {
      if(flight.epoch!==audioEpoch||document.hidden)throw error;
      // One replacement per explicit attempt. Never loop or auto-play on focus.
      discardOutput(context);context=create();ctx=context;
      try { await waitForOutput(context,flight,true); }
      catch(error) {
        outputNeedsCheck=true;
        // Leave a fresh context available for the next explicit tap if the OS
        // consumed transient activation while the old resume was timing out.
        throw Error('音声出力を復旧できません。ページを表示したまま再生ボタンをもう一度押してください。');
      }
    }
    if(flight.epoch!==audioEpoch||document.hidden)throw Error('音声出力の開始を中止しました。');
    outputNeedsCheck=false;return context;
  })().finally(()=>{if(audioFlight===flight)audioFlight=null});
  return flight.promise;
}
function backgroundAudio() {
  outputNeedsCheck=true;
  // Also invalidate PLAY waiting for resume/IDB, even if playing is still null.
  pause();
  if(rec)stopRecord('ページが非表示になったため録音を終了');
}
