let oauthCache={token:null,expiresAt:0,scope:""};
let reportCache=new Map();

const encoder=new TextEncoder();

function json(body,status=200,origin=''){
  const headers={
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'vary':'Origin'
  };
  if(origin) headers['access-control-allow-origin']=origin;
  return new Response(JSON.stringify(body),{status,headers});
}
function b64urlBytes(input){
  input=input.replace(/-/g,'+').replace(/_/g,'/');
  const pad=input.length%4?4-(input.length%4):0;
  input+= '='.repeat(pad);
  const raw=atob(input),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
function b64urlText(input){return new TextDecoder().decode(b64urlBytes(input))}
function toB64url(bytes){
  let s=''; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function parseJwt(token){
  const parts=token.split('.');
  if(parts.length!==3) throw new Error('Invalid JWT');
  return {header:JSON.parse(b64urlText(parts[0])),payload:JSON.parse(b64urlText(parts[1])),signingInput:parts[0]+'.'+parts[1],signature:b64urlBytes(parts[2])};
}
async function verifyFirebaseAdmin(idToken,env){
  const {header,payload,signingInput,signature}=parseJwt(idToken);
  if(header.alg!=='RS256'||!header.kid) throw new Error('Unsupported Firebase token');
  const res=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if(!res.ok) throw new Error('Unable to load Firebase signing keys');
  const jwks=await res.json();
  const keys=Array.isArray(jwks.keys)?jwks.keys:Object.entries(jwks).map(([kid,jwk])=>({...jwk,kid}));
  const jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk) throw new Error('Firebase signing key not found');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,encoder.encode(signingInput));
  if(!ok) throw new Error('Invalid Firebase token signature');
  const now=Math.floor(Date.now()/1000),project=env.FIREBASE_PROJECT_ID;
  if(payload.aud!==project||payload.iss!==`https://securetoken.google.com/${project}`) throw new Error('Firebase token project mismatch');
  if(!payload.sub||payload.exp<=now||payload.iat>now+60) throw new Error('Expired or invalid Firebase token');
  if(payload.admin!==true) throw new Error('Admin claim required');
  return payload;
}
function pemToDer(pem){
  const clean=pem.replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s/g,'');
  const raw=atob(clean),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out.buffer;
}
async function getGoogleAccessToken(env,withSheets=false){
  const scope='https://www.googleapis.com/auth/analytics.readonly'+(withSheets?' https://www.googleapis.com/auth/spreadsheets':'');
  const now=Math.floor(Date.now()/1000);
  if(oauthCache.token&&oauthCache.scope===scope&&oauthCache.expiresAt>now+120) return oauthCache.token;
  const header=toB64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const payload=toB64url(encoder.encode(JSON.stringify({
    iss:env.GA_CLIENT_EMAIL,
    scope,
    aud:'https://oauth2.googleapis.com/token',
    iat:now,
    exp:now+3600
  })));
  const signingInput=header+'.'+payload;
  const key=await crypto.subtle.importKey('pkcs8',pemToDer(env.GA_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(signingInput)));
  const assertion=signingInput+'.'+toB64url(signature);
  const body=new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const res=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body
  });
  if(!res.ok) throw new Error('Google OAuth token request failed: '+await res.text());
  const data=await res.json();
  oauthCache={token:data.access_token,expiresAt:now+(data.expires_in||3600),scope};
  return data.access_token;
}
async function runReport(env,body){
  const token=await getGoogleAccessToken(env);
  const url=`https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;
  const res=await fetch(url,{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!res.ok) throw new Error('GA4 Data API failed: '+await res.text());
  return res.json();
}
async function runFunnelReport(env,body){
  const token=await getGoogleAccessToken(env);
  const url=`https://analyticsdata.googleapis.com/v1alpha/properties/${env.GA4_PROPERTY_ID}:runFunnelReport`;
  const res=await fetch(url,{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!res.ok) throw new Error('GA4 Funnel Data API failed: '+await res.text());
  return res.json();
}
function dateStart(range){
  return ({'1d':'today','7d':'7daysAgo','30d':'30daysAgo','90d':'90daysAgo'})[range]||'30daysAgo';
}
const toolPath='/acoustic-mc-tool/';
function pageFilter(){
  return {filter:{fieldName:'pagePath',stringFilter:{matchType:'EXACT',value:toolPath,caseSensitive:true}}};
}
function funnelStepEvent(name,eventName){
  return {name,filterExpression:{funnelEventFilter:{eventName}}};
}
function visitStep(){
  return {
    name:'VISITORS',
    filterExpression:{
      funnelEventFilter:{
        eventName:'page_view',
        funnelParameterFilterExpression:{
          funnelParameterFilter:{
            eventParameterName:'page_location',
            stringFilter:{matchType:'CONTAINS',value:toolPath,caseSensitive:true}
          }
        }
      }
    }
  };
}
function funnelCounts(report){
  const table=report?.funnelTable||{};
  const dimensions=(table.dimensionHeaders||[]).map(x=>x.name);
  const metrics=(table.metricHeaders||[]).map(x=>x.name);
  const stepIndex=dimensions.indexOf('funnelStepName');
  const usersIndex=metrics.indexOf('activeUsers');
  const counts={VISITORS:0,SIGNUP_VIEW:0,SIGNUPS:0,TOOL_START:0};
  if(stepIndex<0||usersIndex<0) return counts;
  for(const row of table.rows||[]){
    const rawStep=String(row.dimensionValues?.[stepIndex]?.value||'');
    const step=rawStep.replace(/^\d+\.\s*/,'');
    if(step in counts) counts[step]=n(row.metricValues?.[usersIndex]?.value);
  }
  return counts;
}
function n(v){const x=Number(v||0);return Number.isFinite(x)?x:0}
function pct(a,b){return b>0?Math.round((a/b)*1000)/10:0}
function bucketSource(value,medium=''){
  const s=String(value||'').trim().toLowerCase();
  const m=String(medium||'').trim().toLowerCase();
  if(!s||s==='(direct)'||s==='direct') return 'direct';
  if(s==='x'||s.includes('twitter')||s==='t.co'||s==='x.com'||s.endsWith('.x.com')) return 'x';
  if(s==='note'||s==='note.com'||s.endsWith('.note.com')) return 'note';
  if(s==='youtube'||s==='youtube.com'||s.endsWith('.youtube.com')||s==='youtu.be'||s.endsWith('.youtu.be')) return 'youtube';
  if(m==='organic'||m==='organic_search') return 'search';
  return 'other';
}
async function buildReport(env,range,period=null){
  const cacheKey=range;
  const cached=reportCache.get(cacheKey);
  if(!period&&cached&&cached.expiresAt>Date.now()) return cached.data;

  const dates=[period||{startDate:dateStart(range),endDate:'today'}];
  const [funnelReport,sourcesReport]=await Promise.all([
    runFunnelReport(env,{
      dateRanges:dates,
      funnel:{
        isOpenFunnel:false,
        steps:[
          visitStep(),
          funnelStepEvent('SIGNUP_VIEW','signup_view'),
          funnelStepEvent('SIGNUPS','sign_up'),
          funnelStepEvent('TOOL_START','tool_start')
        ]
      }
    }),
    runReport(env,{dateRanges:dates,dimensions:[{name:'sessionSource'},{name:'sessionMedium'}],metrics:[{name:'sessions'}],dimensionFilter:pageFilter(),limit:period?'10000':'100'})
  ]);

  if(period) validateDailyReports(funnelReport,sourcesReport);
  const funnel=funnelCounts(funnelReport);
  const visitors=funnel.VISITORS;
  const source={x:0,note:0,youtube:0,search:0,direct:0,other:0};
  for(const row of sourcesReport.rows||[]){
    const key=bucketSource(row.dimensionValues?.[0]?.value,row.dimensionValues?.[1]?.value);
    source[key]+=n(row.metricValues?.[0]?.value);
  }
  const data={
    ok:true,
    range,
    generatedAt:new Date().toISOString(),
    totals:{
      visitors,
      signupView:funnel.SIGNUP_VIEW,
      signups:funnel.SIGNUPS,
      toolStart:funnel.TOOL_START,
      registerRate:pct(funnel.SIGNUPS,visitors),
      toolStartRate:pct(funnel.TOOL_START,funnel.SIGNUPS)
    },
    source
  };
  if(!period) reportCache.set(cacheKey,{data,expiresAt:Date.now()+5*60*1000});
  return data;
}

/*
 * Private daily funnel export for SPACE FLOW DESIGN reporting.
 * Requires ART_DAILY_SHEET_ID and spreadsheet Editor access for GA_CLIENT_EMAIL.
 * Never exports user IDs, emails, audio, or session contents.
 */
const legacyDailyHeader=['DateJST','Window','GeneratedAtUTC','VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START','RegisterRatePct','ToolStartRatePct','SourceX','SourceNote','SourceDirect','SourceOther','Status'];
const dailyHeader=[...legacyDailyHeader,'SourceYouTube','SourceSearch'];
function todayJst(timestamp=Date.now()){
  return new Date(timestamp+9*60*60*1000).toISOString().slice(0,10);
}
function shiftDate(date,days){
  return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}
function validateDailyReports(funnel,sources){
  const table=funnel?.funnelTable;
  const di=table?.dimensionHeaders?.findIndex(x=>x.name==='funnelStepName');
  const mi=table?.metricHeaders?.findIndex(x=>x.name==='activeUsers');
  if(!(di>=0&&mi>=0)) throw new Error('Invalid GA4 funnel response');
  const steps=new Set(['VISITORS','SIGNUP_VIEW','SIGNUPS','TOOL_START']);
  const seen=new Set();
  const validCount=value=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value));
  if(table.rows!==undefined&&!Array.isArray(table.rows)) throw new Error('Invalid GA4 funnel rows');
  for(const row of table.rows||[]){
    const step=String(row.dimensionValues?.[di]?.value||'').replace(/^\d+\.\s*/,'');
    if(!steps.has(step)||seen.has(step)||!validCount(row.metricValues?.[mi]?.value)) throw new Error('Invalid GA4 funnel row');
    seen.add(step);
  }
  // A schema-valid empty report is zero *reported* users, never evidence of finality.
  if(seen.size&&seen.size!==4) throw new Error('Incomplete GA4 funnel steps');
  const counts=Object.values(funnelCounts(funnel));
  if(counts.some((n,i)=>i>0&&n>counts[i-1])) throw new Error('Invalid closed-funnel ordering');
  if(sources?.dimensionHeaders?.[0]?.name!=='sessionSource'||sources?.dimensionHeaders?.[1]?.name!=='sessionMedium'||sources?.metricHeaders?.[0]?.name!=='sessions') throw new Error('Invalid GA4 source response');
  if(sources.metadata?.timeZone!=='Asia/Tokyo') throw new Error('GA4 property timezone must be Asia/Tokyo');
  if(sources.rows!==undefined&&!Array.isArray(sources.rows)) throw new Error('Invalid GA4 source rows');
  if(Number(sources.rowCount||0)>(sources.rows||[]).length) throw new Error('Truncated GA4 source response');
  for(const row of sources.rows||[]){
    if(typeof row.dimensionValues?.[0]?.value!=='string'||typeof row.dimensionValues?.[1]?.value!=='string'||!validCount(row.metricValues?.[0]?.value)) throw new Error('Invalid GA4 source row');
  }
  for(const meta of [table.metadata,sources.metadata]){
    if(meta?.subjectToThresholding||meta?.dataLossFromOtherRow||meta?.samplingMetadatas?.length||meta?.emptyReason) throw new Error('GA4 report is limited or sampled');
  }
}
async function sheetsRequest(url,token,options={}){
  const response=await fetch(url,{
    ...options,
    headers:{authorization:'Bearer '+token,...(options.body?{'content-type':'application/json'}:{})}
  });
  if(!response.ok) throw new Error('Google Sheets request failed: HTTP '+response.status);
  return response.json();
}
async function saveDailyFunnel(env,timestamp=Date.now()){
  const sheetId=String(env.ART_DAILY_SHEET_ID||'').trim();
  if(!/^[A-Za-z0-9_-]+$/.test(sheetId)) throw new Error('ART_DAILY_SHEET_ID is missing or invalid');
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(sheetId)+'/values';
  let token=await getGoogleAccessToken(env,true);
  const existing=await sheetsRequest(base+'/'+encodeURIComponent('Funnel!A:P'),token);
  const rows=existing.values;
  if(!Array.isArray(rows)) throw new Error('Funnel header is missing or incompatible');
  const legacy=JSON.stringify(rows[0])===JSON.stringify(legacyDailyHeader);
  if(!legacy&&JSON.stringify(rows[0])!==JSON.stringify(dailyHeader)) throw new Error('Funnel header is missing or incompatible');
  const indexes=new Map();
  rows.slice(1).forEach((row,i)=>{
    if(!row.length) return;
    const key=row[0]+'|'+row[1];
    if(indexes.has(key)) throw new Error('Duplicate Funnel date/window rows; resolve before export');
    indexes.set(key,i+2);
  });
  const date=todayJst(timestamp),data=legacy?[{range:'Funnel!A1:P1',majorDimension:'ROWS',values:[dailyHeader]}]:[];
  let nextRow=rows.length+1;
  // Refresh today and the preceding 7 days. One-day and seven-day users are
  // computed independently by GA4, never added or divided across daily rows.
  // Single configured cron only; do not overlap manual runs with the cron.
  for(let age=0;age<=7;age++){
    const endDate=shiftDate(date,-age);
    for(const range of ['1d','7d']){
      const startDate=shiftDate(endDate,range==='7d'?-6:0);
      const report=await buildReport(env,range,{startDate,endDate});
      const t=report.totals,s=report.source;
      const key=endDate+'|'+range;
      const at=indexes.get(key)||nextRow++;
      const status=age===0?'暫定・当日途中（集計日時参照）':age<3?'暫定・後日再集計':'再集計済・確定保証なし';
      const row=[endDate,range,report.generatedAt,t.visitors,t.signupView,t.signups,t.toolStart,
        t.visitors>0?t.registerRate:'',t.signups>0?t.toolStartRate:'',s.x,s.note,s.direct,s.other,status,s.youtube,s.search];
      data.push({range:'Funnel!A'+at+':P'+at,majorDimension:'ROWS',values:[row]});
    }
  }
  // Do not overwrite successful rows if any GA4 read fails. One batch write
  // also makes sequential retries update the same date/window keys.
  token=await getGoogleAccessToken(env,true);
  await sheetsRequest(base+':batchUpdate',token,{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
}

export default {
  async fetch(request,env){
    const allowedOrigin=env.ALLOWED_ORIGIN||'https://spaceflowdesign.github.io';
    const origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS'){
      if(origin!==allowedOrigin) return new Response(null,{status:403});
      return new Response(null,{status:204,headers:{
        'access-control-allow-origin':allowedOrigin,
        'access-control-allow-headers':'Authorization, Content-Type',
        'access-control-allow-methods':'GET, OPTIONS',
        'access-control-max-age':'600',
        'vary':'Origin'
      }});
    }
    if(request.method!=='GET') return json({ok:false,error:'Method not allowed'},405,origin===allowedOrigin?allowedOrigin:'');
    if(origin&&origin!==allowedOrigin) return json({ok:false,error:'Origin not allowed'},403,'');
    const auth=request.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')) return json({ok:false,error:'Authentication required'},401,origin===allowedOrigin?allowedOrigin:'');
    try{
      await verifyFirebaseAdmin(auth.slice(7),env);
      const url=new URL(request.url);
      if(url.pathname!=='/api/funnel') return json({ok:false,error:'Not found'},404,origin===allowedOrigin?allowedOrigin:'');
      const range=['1d','7d','30d','90d'].includes(url.searchParams.get('range'))?url.searchParams.get('range'):'30d';
      const data=await buildReport(env,range);
      return json(data,200,origin===allowedOrigin?allowedOrigin:'');
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=/Admin claim|Firebase token|Authentication/.test(message)?403:500;
      return json({ok:false,error:message},status,origin===allowedOrigin?allowedOrigin:'');
    }
  },
  scheduled(event,env,ctx){
    ctx.waitUntil(saveDailyFunnel(env,event.scheduledTime));
  }
};
