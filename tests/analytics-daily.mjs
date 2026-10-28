import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../worker/analytics-api.js',import.meta.url),'utf8');
const header=['DateJST','Window','GeneratedAtUTC','VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START','RegisterRatePct','ToolStartRatePct','SourceX','SourceNote','SourceDirect','SourceOther','Status','SourceYouTube','SourceSearch'];
function fixture(){
  const state={rows:[header],calls:[],writes:0,fail:false,malformed:false,zone:'Asia/Tokyo',empty:false,gaReads:0,failAt:0,truncated:false,limited:false,sheetReadStatus:200,sheetWriteStatus:200,funnelRows:null};
  const context=vm.createContext({TextEncoder,TextDecoder,URL,URLSearchParams,Request,Response,Date,Map,Set,Intl,atob,btoa,crypto:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1])}},fetch:async(url,options={})=>{
    const body=options.body&&JSON.parse(options.body instanceof URLSearchParams?'{}':options.body);
    state.calls.push({url,body});
    if(url.includes('oauth2')) return Response.json({access_token:'test-only',expires_in:3600});
    if(url.includes('sheets.googleapis')){
      if(options.method==='POST'){
        if(state.sheetWriteStatus!==200) return Response.json({}, {status:state.sheetWriteStatus});
        state.writes++;
        for(const d of body.data){state.rows[Number(d.range.match(/!A(\d+)/)[1])-1]=d.values[0];}
        return Response.json({totalUpdatedRows:body.data.length});
      }
      return Response.json({values:state.rows},{status:state.sheetReadStatus});
    }
    state.gaReads++;
    if(state.fail||state.gaReads===state.failAt) return Response.json({error:'simulated'}, {status:503});
    if(state.malformed) return Response.json({});
    if(url.includes('runFunnelReport')) return Response.json({funnelTable:{dimensionHeaders:[{name:'funnelStepName'}],metricHeaders:[{name:'activeUsers'}],rows:state.empty?[]:state.funnelRows||['VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START'].map((s,i)=>({dimensionValues:[{value:`${i+1}. ${s}`}],metricValues:[{value:String([10,6,3,2][i])}]}))}});
    return Response.json({dimensionHeaders:[{name:'sessionSource'},{name:'sessionMedium'}],metricHeaders:[{name:'sessions'}],metadata:{timeZone:state.zone,subjectToThresholding:state.limited},rows:state.empty?[]:['t.co','note.com','youtube.com','(direct)','google','referrer.example'].map((s,i)=>({dimensionValues:[{value:s},{value:['referral','referral','referral','(none)','organic','referral'][i]}],metricValues:[{value:String([4,3,5,2,1,6][i])}]})),rowCount:state.truncated?10001:state.empty?0:6});
  }});
  vm.runInContext(source.replace('export default {','globalThis.worker = {')+'\nglobalThis.api={saveDailyFunnel,todayJst,shiftDate};',context);
  return {state,api:context.api,worker:context.worker,env:{GA_CLIENT_EMAIL:'test@example.invalid',GA_PRIVATE_KEY:'AA==',GA4_PROPERTY_ID:'test',ART_DAILY_SHEET_ID:'test'}};
}
const funnelRow=(step,count)=>({dimensionValues:[{value:step}],metricValues:[{value:String(count)}]});
let f=fixture();
const instant=Date.parse('2026-10-13T14:30:00Z');
await f.api.saveDailyFunnel(f.env,instant);
assert.equal(f.state.rows.length,17);
assert.equal(f.state.writes,1);
const calls=f.state.calls.filter(c=>c.url.includes('analyticsdata'));
assert.equal(calls.length,32);
assert.deepEqual(calls[0].body.dateRanges,[{startDate:'2026-10-13',endDate:'2026-10-13'}]);
assert.deepEqual(calls[2].body.dateRanges,[{startDate:'2026-10-07',endDate:'2026-10-13'}]);
assert(calls.filter(c=>c.url.includes('runFunnelReport')).every(c=>c.body.funnel.isOpenFunnel===false));
assert.deepEqual(f.state.rows[1].slice(3,13),[10,6,3,2,30,66.7,4,3,2,6]);
assert.deepEqual(f.state.rows[1].slice(14,16),[5,1]);
assert.deepEqual(calls.find(c=>c.url.includes(':runReport')).body.dimensions,[{name:'sessionSource'},{name:'sessionMedium'}]);
assert.match(f.state.rows[1][13],/暫定/);
await f.api.saveDailyFunnel(f.env,instant);
assert.equal(f.state.rows.length,17,'sequential rerun must update');
assert.equal(f.state.writes,2);
await f.api.saveDailyFunnel(f.env,instant+86400000);
assert.equal(f.state.rows.length,19,'next day adds only two rows');
const frozen=JSON.stringify(f.state.rows);
f.state.fail=true;
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/GA4/);
assert.equal(JSON.stringify(f.state.rows),frozen);
f.state.fail=false; f.state.malformed=true;
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/Invalid GA4/);
assert.equal(JSON.stringify(f.state.rows),frozen);
f.state.malformed=false; f.state.zone='America/Los_Angeles';
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/timezone/);
assert.equal(JSON.stringify(f.state.rows),frozen);
f=fixture(); f.state.empty=true;
await f.api.saveDailyFunnel(f.env,instant);
assert.deepEqual(f.state.rows[1].slice(3,9),[0,0,0,0,'','']);
assert.match(f.state.rows[1][13],/暫定/);
// A closed GA4 funnel may omit trailing zero-user steps; keep them at zero.
f=fixture(); f.state.funnelRows=[funnelRow('1. VISITORS',10),funnelRow('2. SIGNUP_VIEW',6)];
await f.api.saveDailyFunnel(f.env,instant);
assert.deepEqual(f.state.rows[1].slice(3,9),[10,6,0,0,0,'']);
assert.equal(f.state.writes,1,'trailing zero-user steps must not block a complete batch');
f=fixture(); f.state.funnelRows=[funnelRow('1. VISITORS',3)];
await f.api.saveDailyFunnel(f.env,instant);
assert.deepEqual(f.state.rows[1].slice(3,9),[3,0,0,0,0,'']);
// A missing earlier stage with a later stage present is not a safe zero.
// Reject suspicious API data without changing a previously valid Sheet.
for(const sparse of [
  [funnelRow('1. VISITORS',10),funnelRow('3. SIGNUPS',1)],
  [funnelRow('2. SIGNUP_VIEW',1)]
]){
  f=fixture(); f.state.funnelRows=sparse;
  await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/Incomplete GA4 funnel steps/);
  assert.equal(f.state.writes,0);
}
f=fixture(); f.state.funnelRows=[funnelRow('1. VISITORS',3),funnelRow('1. VISITORS',3)];
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/Invalid GA4 funnel row/);
assert.equal(f.state.writes,0);
f=fixture(); f.state.rows.push(['2026-10-13','1d'],['2026-10-13','1d']);
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/Duplicate/);
assert.equal(f.state.writes,0);
f=fixture(); f.state.rows[0]=header.slice(0,14); f.state.rows.push(['2026-10-01','1d','original historical record'],['2026-10-11','1d','refresh me']);
await f.api.saveDailyFunnel(f.env,instant);
assert.deepEqual(f.state.rows[0],header,'legacy header must be migrated in one batch');
assert.deepEqual(f.state.rows[1],['2026-10-01','1d','original historical record'],'rows outside refresh window are preserved');
assert.equal(f.state.writes,1);
assert.equal(f.state.rows[2][0],'2026-10-11');
assert.equal(f.state.rows[2].length,16,'existing in-window rows are refreshed to 16 columns');
assert.equal(f.state.rows.filter(r=>r[0]==='2026-10-11'&&r[1]==='1d').length,1);
// A failure after successful reads must not partially migrate the old header.
for(const fault of [{failAt:32},{truncated:true},{limited:true},{sheetReadStatus:403},{sheetWriteStatus:403}]){
  f=fixture(); f.state.rows=[header.slice(0,14),['2026-10-11','1d','keep on failure']];
  Object.assign(f.state,fault);
  const before=JSON.stringify(f.state.rows);
  await assert.rejects(f.api.saveDailyFunnel(f.env,instant));
  assert.equal(f.state.writes,0);
  assert.equal(JSON.stringify(f.state.rows),before);
}
f=fixture(); f.env.ART_DAILY_SHEET_ID='';
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/ART_DAILY_SHEET_ID/);
assert.equal(f.state.calls.length,0);
f=fixture(); f.state.rows[0]=['wrong'];
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/header/);
assert.equal(f.state.writes,0);
f=fixture();
assert.equal(f.api.todayJst(Date.parse('2026-10-12T15:00:00Z')),'2026-10-13');
assert.equal(f.api.shiftDate('2026-01-01',-6),'2025-12-26');
const res=await f.worker.fetch(new Request('https://example.invalid/api/funnel'),{});
assert.equal(res.status,401);
const cross=await f.worker.fetch(new Request('https://example.invalid/api/funnel',{headers:{Origin:'https://evil.invalid'}}),{});
assert.equal(cross.status,403);
let pending;
f.worker.scheduled({scheduledTime:instant},f.env,{waitUntil:p=>{pending=p;}});
await pending;
assert.equal(f.state.rows[1][0],'2026-10-13');
console.log('PASS: sparse trailing funnel steps, incomplete-gap protection, six source buckets, two GA4 session dimensions, daily column migration, explicit JST dates, closed funnel, backfill, sequential upsert, failures without overwrite, validation, 401/403, scheduled timestamp');
