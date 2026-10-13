import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../worker/analytics-api.js',import.meta.url),'utf8');
const header=['DateJST','Window','GeneratedAtUTC','VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START','RegisterRatePct','ToolStartRatePct','SourceX','SourceNote','SourceDirect','SourceOther','Status'];
function fixture(){
  const state={rows:[header],calls:[],writes:0,fail:false,malformed:false,zone:'Asia/Tokyo',empty:false};
  const context=vm.createContext({TextEncoder,TextDecoder,URL,URLSearchParams,Request,Response,Date,Map,Set,Intl,atob,btoa,crypto:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1])}},fetch:async(url,options={})=>{
    const body=options.body&&JSON.parse(options.body instanceof URLSearchParams?'{}':options.body);
    state.calls.push({url,body});
    if(url.includes('oauth2')) return Response.json({access_token:'test-only',expires_in:3600});
    if(url.includes('sheets.googleapis')){
      if(options.method==='POST'){
        state.writes++;
        for(const d of body.data){state.rows[Number(d.range.match(/!A(\d+)/)[1])-1]=d.values[0];}
        return Response.json({totalUpdatedRows:body.data.length});
      }
      return Response.json({values:state.rows});
    }
    if(state.fail) return Response.json({error:'simulated'}, {status:503});
    if(state.malformed) return Response.json({});
    if(url.includes('runFunnelReport')) return Response.json({funnelTable:{dimensionHeaders:[{name:'funnelStepName'}],metricHeaders:[{name:'activeUsers'}],rows:state.empty?[]:['VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START'].map((s,i)=>({dimensionValues:[{value:`${i+1}. ${s}`}],metricValues:[{value:String([10,6,3,2][i])}]}))}});
    return Response.json({dimensionHeaders:[{name:'sessionSource'}],metricHeaders:[{name:'sessions'}],metadata:{timeZone:state.zone},rows:state.empty?[]:['t.co','note.com','(direct)','google'].map((s,i)=>({dimensionValues:[{value:s}],metricValues:[{value:String([4,3,2,1][i])}]})),rowCount:state.empty?0:4});
  }});
  vm.runInContext(source.replace('export default {','globalThis.worker = {')+'\nglobalThis.api={saveDailyFunnel,todayJst,shiftDate};',context);
  return {state,api:context.api,worker:context.worker,env:{GA_CLIENT_EMAIL:'test@example.invalid',GA_PRIVATE_KEY:'AA==',GA4_PROPERTY_ID:'test',ART_DAILY_SHEET_ID:'test'}};
}
let f=fixture();
const instant=Date.parse('2026-10-13T13:30:00Z');
await f.api.saveDailyFunnel(f.env,instant);
assert.equal(f.state.rows.length,17);
assert.equal(f.state.writes,1);
const calls=f.state.calls.filter(c=>c.url.includes('analyticsdata'));
assert.equal(calls.length,32);
assert.deepEqual(calls[0].body.dateRanges,[{startDate:'2026-10-13',endDate:'2026-10-13'}]);
assert.deepEqual(calls[2].body.dateRanges,[{startDate:'2026-10-07',endDate:'2026-10-13'}]);
assert(calls.filter(c=>c.url.includes('runFunnelReport')).every(c=>c.body.funnel.isOpenFunnel===false));
assert.deepEqual(f.state.rows[1].slice(3,13),[10,6,3,2,30,66.7,4,3,2,1]);
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
f=fixture(); f.state.rows.push(['2026-10-13','1d'],['2026-10-13','1d']);
await assert.rejects(f.api.saveDailyFunnel(f.env,instant),/Duplicate/);
assert.equal(f.state.writes,0);
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
console.log('PASS: explicit JST dates, exact 7-day window, closed funnel, source units, backfill, sequential upsert, fail without overwrite, malformed response, timezone, empty/undefined rates, duplicate/header guard, 401/403, scheduled timestamp');
