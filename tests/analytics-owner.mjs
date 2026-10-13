import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the production access layer with a mocked Firebase auth state.
// The SDK must not initialize Analytics (and send its automatic page_view)
// for an admin account or an owner-marked browser.
const source=readFileSync(new URL('../access-control.js',import.meta.url),'utf8');

async function probe({admin=false,marker=false,utm=''}) {
  let analyticsStarts=0;
  const events=[];
  const data=new Map(marker?[['art_admin_analytics_excluded_v1','1']]:[]);
  const store={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const user=admin?{uid:'test-owner',getIdTokenResult:async()=>({claims:{admin:true}})}:null;
  const firebase={
    apps:[],
    initializeApp(){this.apps.push(1)},
    analytics(){analyticsStarts++;return{logEvent:(...args)=>events.push(args),setAnalyticsCollectionEnabled:()=>{}}},
    auth(){return{setPersistence:async()=>{},onAuthStateChanged:callback=>{void callback(user)}}},
    firestore(){return{collection(){return{doc(){return{get:async()=>({exists:false,data:()=>({})})}}}}}}
  };
  firebase.auth.Auth={Persistence:{LOCAL:'local'}};
  const window={
    firebase,
    AMC_ACCESS_CONFIG:{families:{acoustic:{enabled:true,products:{tool:{enabled:true,maxDevices:2}}}}},
    AMC_FIREBASE_CONFIG:{apiKey:'test',authDomain:'test',projectId:'test',appId:'test',measurementId:'G-TEST'},
    dispatchEvent:()=>{}
  };
  const Query=class {
    constructor(query){this.params=Object.fromEntries(query.replace(/^\?/,'').split('&').filter(Boolean).map(pair=>pair.split('=')))}
    get(key){return this.params[key]||null}
  };
  const access=new Function(
    'window','firebase','localStorage','sessionStorage','crypto','CustomEvent','URLSearchParams','location','document',
    source+';return window.AMCAccess;'
  )(window,firebase,store,store,{randomUUID:()=> 'device-test'},class{},Query,{search:utm},{referrer:''});
  await access.start();
  access.trackSignupView();
  return{analyticsStarts,events,marked:data.get('art_admin_analytics_excluded_v1')};
}

const owner=await probe({admin:true});
assert.equal(owner.analyticsStarts,0,'an authenticated admin must not initialize GA4');
assert.equal(owner.marked,'1','admin browsing should mark this device');
const marked=await probe({marker:true});
assert.equal(marked.analyticsStarts,0,'owner device stays excluded when signed out');
const visitor=await probe({utm:'?utm_source=youtube'});
assert.equal(visitor.analyticsStarts,1,'ordinary visitor analytics still works');
assert.equal(visitor.events[0][1].source_group,'youtube');
console.log('PASS: owner/admin analytics exclusion and ordinary YouTube visitor attribution');
