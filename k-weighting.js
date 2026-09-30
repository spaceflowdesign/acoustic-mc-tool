// Streaming K-weighting. Coefficients follow BS.1770's 48 kHz reference;
// bilinear parameterization (De Man) extends to the decoded sample rate.
// No filtered PCM is retained. Filter state must survive storage chunk edges.
function kCoefficients(sr){
  const k=Math.tan(Math.PI*1681.974450955533/sr),q=.7071752369554196;
  const vh=10**(3.999843853973347/20),vb=vh**.4996667741545416,d=1+k/q+k*k;
  const p=Math.tan(Math.PI*38.13547087602444/sr),pq=.5003270373238773,pd=1+p/pq+p*p;
  return [[(vh+vb*k/q+k*k)/d,2*(k*k-vh)/d,(vh-vb*k/q+k*k)/d,2*(k*k-1)/d,(1-k/q+k*k)/d],
    [1,-2,1,2*(p*p-1)/pd,(1-p/pq+p*p)/pd]];
}
function kChannelWeights(channels){return ({1:[1],2:[1,1],4:[1,1,1.41,1.41],6:[1,1,1,0,1.41,1.41]})[channels]||null}
function createKState(sr,channels){
  const weights=kChannelWeights(channels);if(!weights)return null;
  return {weights,coeff:kCoefficients(sr),state:weights.map(()=>[[0,0],[0,0]])};
}
function kEnergyFeed(state,data,channel,at,step,energy){
  const weight=state.weights[channel];if(!weight)return;
  const [a,b]=state.coeff,[u,v]=state.state[channel];
  let u0=u[0],u1=u[1],v0=v[0],v1=v[1];
  for(let i=0;i<data.length;i++){
    const x=data[i],y=a[0]*x+u0;u0=a[1]*x-a[3]*y+u1;u1=a[2]*x-a[4]*y;
    const z=b[0]*y+v0;v0=b[1]*y-b[3]*z+v1;v1=b[2]*y-b[4]*z;
    energy[Math.floor((at+i)/step)]+=weight*z*z;
  }
  u[0]=u0;u[1]=u1;v[0]=v0;v[1]=v1;
}
