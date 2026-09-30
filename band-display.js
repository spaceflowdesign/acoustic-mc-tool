// Display-only settings. Never affect synchronization, loudness or saved audio.
const musicNames=['SUB','BASS','LOW MID','MID','HIGH MID','TREBLE'];
const defaultEdges=[20,60,250,500,2000,8000,20000];
function validEdges(edges){return Array.isArray(edges)&&edges.length===7&&edges.every((v,i)=>Number.isFinite(v)&&v>=20&&v<=20000&&(!i||v>edges[i-1]));}
function parseBandSettings(text){try{const s=JSON.parse(text);if(validEdges(s.edges))return {edges:[...s.edges],custom:s.custom===true};}catch{}return {edges:[...defaultEdges],custom:false};}
function rangeLevel(power,sr,n,low,high){
  if(!power||high>sr/2||low>=high)return null;
  const lo=Math.max(1,Math.ceil(low*n/sr)),hi=Math.min(power.length-1,Math.ceil(high*n/sr)-1);
  // Narrow custom ranges below FFT resolution are unavailable, not invented.
  if(hi<lo)return null;let sum=0;for(let i=lo;i<=hi;i++)sum+=power[i];
  return 10*Math.log10(Math.max(1e-12,sum/(hi-lo+1)));
}
function displayDifferences(a,b,edges){
  if(!a||!b)return [];
  return edges.slice(0,-1).map((low,i)=>{const high=edges[i+1],A=rangeLevel(a.power,a.buffer.sampleRate,a.fftSize,low,high),B=rangeLevel(b.power,b.buffer.sampleRate,b.fftSize,low,high);return A!==null&&B!==null&&Number.isFinite(A)&&Number.isFinite(B)&&A> -100&&B> -100?{f:Math.sqrt(low*high),low,high,delta:B-A}:null;}).filter(Boolean);
}
// Dedicated visual worker: failures cannot discard the import/analysis worker.
function spectrumWorker(){
  function transform(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const v=re[i];re[i]=re[j];re[j]=v;}}for(let len=2;len<=n;len*=2){const a=-2*Math.PI/len,cr=Math.cos(a),ci=Math.sin(a);for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=start+j,v=u+len/2,tr=wr*re[v]-wi*im[v],ti=wr*im[v]+wi*re[v];re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}}}
  self.onmessage=({data})=>{const {id,channels}=data,n=8192,power=new Float64Array(n/2+1);for(const channel of channels){const re=new Float64Array(n),im=new Float64Array(n);let total=0;for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));re[i]=channel[i]*w;total+=w;}transform(re,im);for(let i=0;i<power.length;i++)power[i]+=(re[i]*re[i]+im[i]*im[i])/(total*total)*(i&&i<n/2?4:1)/channels.length;}self.postMessage({id,power},[power.buffer]);};
}
