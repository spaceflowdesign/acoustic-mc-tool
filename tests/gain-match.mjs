import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),c=vm.createContext({});
vm.runInContext(readFileSync(new URL('k-weighting.js',root),'utf8')+'\n'+readFileSync(new URL('gain-match.js',root),'utf8'),c);
let passed=0;function check(name,fn){fn();console.log('PASS '+name);passed++}
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);
function slot(energy,kind='file',rate=100){return {inputKind:kind,buffer:{duration:energy.length/rate},envRate:rate,env:Float32Array.from(energy,Math.sqrt),kEnergy:Float64Array.from(energy)}}
const constant=(value,n=400,kind='file')=>slot(Array(n).fill(value),kind);
check('48 kHz coefficients match ITU BS.1770 reference tables',()=>{
  const reference=[[1.53512485958697,-2.69169618940638,1.19839281085285,-1.69065929318241,.73248077421585],[1,-2,1,-1.99004745483398,.99007225036621]];
  c.kCoefficients(48000).forEach((row,i)=>row.forEach((v,j)=>near(v,reference[i][j],2e-12)));
});
check('streaming K filter preserves state across arbitrary chunks at 44.1/48/96 kHz',()=>{
  for(const sr of [44100,48000,96000]){
    const data=Float32Array.from({length:sr},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/sr)),step=Math.round(sr/100);
    const whole=new Float64Array(Math.ceil(sr/step)),chunks=new Float64Array(whole.length),one=c.createKState(sr,1),two=c.createKState(sr,1);
    c.kEnergyFeed(one,data,0,0,step,whole);
    for(let i=0;i<data.length;i+=137)c.kEnergyFeed(two,data.subarray(i,i+137),0,i,step,chunks);
    assert.deepEqual(chunks,whole);
    const mean=whole.slice(20).reduce((a,b)=>a+b,0)/((whole.length-20)*step);
    near(-.691+10*Math.log10(mean),-23, .06);
  }
});
check('mono/stereo/quad/5.1 weights, LFE exclusion, unsupported layout stays explicit',()=>{
  assert.equal(c.createKState(48000,6).weights[3],0);assert.equal(c.createKState(48000,4).weights[2],1.41);
  assert.equal(c.createKState(48000,3),null);assert.equal(c.createKState(48000,8),null);
  const A=constant(.01),B=constant(.02);A.kEnergy=null;assert.equal(c.calculateGainMatch(A,B,0).valid,false);
});
check('FILE uses weighted energy, never unweighted RMS or peak',()=>{
  const A=constant(.01),B=constant(.04);B.env=A.env;const r=c.calculateGainMatch(A,B,0);
  near(r.db.B,-6.020599913);near(r.gains.A,1);near(r.gains.B,.5);assert.equal(r.mode,'file');
});
check('FILE absolute and relative gates exclude silence and quiet segments',()=>{
  const level=c.gatedLoudness([0,1e-10,.00001,.01,.01]);near(level,-20.691);
  assert.equal(c.gatedLoudness([0,1e-10]),null);
});
check('FILE evaluates aligned common interval, not full-source loudness',()=>{
  const A=constant(.01),B=slot([...Array(100).fill(.5),...Array(400).fill(.04)]);
  near(c.calculateGainMatch(A,B,1).db.B,-6.020599913);
  assert.ok(Math.abs(c.calculateGainMatch(A,B,0).db.B+6.020599913)>1);
  near(c.calculateGainMatch(B,A,-1).db.A,-6.020599913);
});
check('AIR ignores K energy and selects the same jointly active blocks',()=>{
  const A=slot([...Array(100).fill(0),...Array(200).fill(.01),...Array(100).fill(0)],'air');
  const B=slot([...Array(100).fill(.09),...Array(200).fill(.04),...Array(100).fill(0)],'air');
  const r=c.calculateGainMatch(A,B,1);assert.equal(r.mode,'air');near(r.db.B,-6.020599913,1e-5);assert.ok(r.kept<r.blocks);
  A.kEnergy.fill(1);B.kEnergy.fill(.00001);near(c.calculateGainMatch(A,B,1).db.B,r.db.B);
});
check('AIR/mixed provenance is explicit; filename cannot impersonate AIR REC',()=>{
  const A=constant(.01),B=constant(.04,400,'air');assert.equal(c.calculateGainMatch(A,B,0).mode,'air');
  B.inputKind='file';B.name='AIR_REC_B.wav';assert.equal(c.calculateGainMatch(A,B,0).mode,'file');
});
check('silence, low floor, no overlap, nonfinite and too-short intervals fail safe',()=>{
  for(const kind of ['air','file'])for(const e of [0,1e-12,NaN])assert.equal(c.calculateGainMatch(constant(e,400,kind),constant(.01),0).valid,false);
  assert.equal(c.calculateGainMatch(constant(.01,39),constant(.02),0).valid,false);
  assert.equal(c.calculateGainMatch(constant(.01),constant(.02),5).valid,false);
});
check('equal sources stay unity; arbitrary differences attenuate only louder side',()=>{
  for(const kind of ['air','file'])for(const d of [-20,-6,0,6,20]){
    const r=c.calculateGainMatch(constant(.001,400,kind),constant(.001*10**(d/10),400,kind),0);
    assert.equal(r.valid,true);assert.ok(r.gains.A<=1&&r.gains.B<=1);near(Math.max(r.gains.A,r.gains.B),1);
    near(r.levelA+r.db.A,r.levelB+r.db.B);
  }
});
check('OFF returns exact unity independent of the retained analysis result',()=>{
  vm.runInContext('gainEnabled=true;gainResult={valid:true,gains:{A:.5,B:1}}',c);near(c.playbackMatchGain('A'),.5);
  vm.runInContext('gainEnabled=false',c);assert.equal(c.playbackMatchGain('A'),1);assert.equal(c.playbackMatchGain('B'),1);
});
console.log(`${passed} GAIN MATCH groups passed`);
