// Included inside dspWorker. All samples contribute to waveform/envelope;
// the same 64 globally distributed FFT windows as RC1 are retained (<= 4 MiB
// for stereo), not 64 windows per chunk. Chunk size never changes the result.
let stream=null;
function beginStream(length,sr,channels) {
  const size=8192,count=Math.min(64,Math.max(1,Math.ceil(length/size))),step=Math.max(1,Math.round(sr/100));
  stream={length,sr,channels,size,step,next:0,
    wave:Array.from({length:channels},()=>({min:new Float32Array(1600).fill(1),max:new Float32Array(1600).fill(-1)})),
    energy:new Float64Array(Math.ceil(length/step)),
    kState:createKState(sr,channels),kEnergy:new Float64Array(Math.ceil(length/step)),
    frames:Array.from({length:count},(_,f)=>({start:Math.floor(f*Math.max(0,length-size)/Math.max(1,count-1)),data:Array.from({length:channels},()=>new Float32Array(Math.min(length,size)))}))};
}
function feedStream(at,channels) {
  const s=stream;if(!s||at!==s.next||channels.length!==s.channels)throw Error('解析チャンクの順序が不正です。');
  const end=at+channels[0].length;if(end>s.length)throw Error('解析範囲が不正です。');
  channels.forEach((data,c)=>{
    if(s.kState)kEnergyFeed(s.kState,data,c,at,s.step,s.kEnergy);
    for(let bin=0;bin<1600;bin++){
      const first=Math.floor(bin*s.length/1600),last=Math.max(first+1,Math.floor((bin+1)*s.length/1600));
      for(let j=Math.max(at,first);j<Math.min(end,last);j++){
        s.wave[c].min[bin]=Math.min(s.wave[c].min[bin],data[j-at]);
        s.wave[c].max[bin]=Math.max(s.wave[c].max[bin],data[j-at]);
      }
    }
    for(let j=0;j<data.length;j++)s.energy[Math.floor((at+j)/s.step)]+=data[j]*data[j];
    for(const f of s.frames){const first=Math.max(at,f.start),last=Math.min(end,f.start+f.data[c].length);if(last>first)f.data[c].set(data.subarray(first-at,last-at),first-f.start);}
  });
  s.next=end;
}
function finishStream() {
  const s=stream;if(!s||s.next!==s.length)throw Error('音声解析が完了していません。');
  const power=new Float64Array(s.size/2+1);
  for(const f of s.frames)for(const data of f.data){
    const re=new Float64Array(s.size),im=new Float64Array(s.size);let winSum=0;
    for(let j=0;j<data.length;j++){const w=.5-.5*Math.cos(2*Math.PI*j/Math.max(1,data.length-1));re[j]=data[j]*w;winSum+=w;}
    fft(re,im);
    for(let k=0;k<power.length;k++)power[k]+=(re[k]*re[k]+im[k]*im[k])/Math.max(1,winSum*winSum)*(k&&k<s.size/2?4:1)/(s.frames.length*s.channels);
  }
  const env=Float32Array.from(s.energy,(v,i)=>Math.sqrt(v/(Math.min(s.step,s.length-i*s.step)*s.channels)));
  const kEnergy=s.kState?Float64Array.from(s.kEnergy,(v,i)=>v/Math.min(s.step,s.length-i*s.step)):null;
  const result={power,wave:s.wave,env,envRate:s.sr/s.step,fftSize:s.size,kEnergy};stream=null;return result;
}
