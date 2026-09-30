// Raw spectral differences. Silence/floor values never become ranked evidence.
function spectralDifferences(a,b,frequencies,readBand){
  if(!a||!b)return [];
  return frequencies.map(f=>{
    const factor=Math.pow(2,1/6),low=f/factor,high=f*factor;
    if(high>Math.min(a.buffer.sampleRate,b.buffer.sampleRate)/2)return null;
    const A=readBand(a.power,a.buffer.sampleRate,a.fftSize,f),B=readBand(b.power,b.buffer.sampleRate,b.fftSize,f);
    if(!Number.isFinite(A)||!Number.isFinite(B)||A<=-100||B<=-100)return null;
    return {f,low,high,delta:B-A};
  }).filter(Boolean);
}
