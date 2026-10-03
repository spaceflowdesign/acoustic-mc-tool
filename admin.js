(() => {
'use strict';
const $=id=>document.getElementById(id), cfg=window.AMC_FIREBASE_CONFIG||{}, acfg=window.AMC_ACCESS_CONFIG||{};
const configured=Boolean(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId);let db=null,current=[];
function setStatus(s){$('adminState').textContent=s}
function fmt(v){try{const d=v?.toDate?v.toDate():v?new Date(v):null;return d&&!isNaN(d)?d.toLocaleString('ja-JP'):'—'}catch{return '—'}}
function activeDevices(u){return Object.values(u.devices||{}).filter(x=>!x?.revoked).length}
function caution(u){const ds=Object.values(u.devices||{});return ds.length>4||activeDevices(u)>2}
function render(){
 const q=$('search').value.trim().toLowerCase(),rows=current.filter(u=>!q||(u.email||'').toLowerCase().includes(q)||u.id.toLowerCase().includes(q));
 $('totalUsers').textContent=current.length;$('activeUsers').textContent=current.filter(u=>(u.state||'active')==='active').length;$('cautionUsers').textContent=current.filter(caution).length;$('bannedUsers').textContent=current.filter(u=>u.state==='banned').length;
 $('users').innerHTML=rows.map(u=>{const s=u.state||'active';return '<tr><td>'+esc(u.email||'—')+'<small>'+esc(u.id)+'</small></td><td>'+fmt(u.lastSeenAt)+'</td><td>'+activeDevices(u)+(caution(u)?' ⚠︎':'')+'</td><td><span class="state '+s+'">'+s.toUpperCase()+'</span></td><td><div class="actions"><button class="warn" data-state="suspended" data-id="'+u.id+'">一時停止</button><button class="danger" data-state="banned" data-id="'+u.id+'">BAN</button><button class="ok" data-state="active" data-id="'+u.id+'">解除</button></div></td></tr>'}).join('')||'<tr><td colspan="5" class="muted">対象ユーザーなし</td></tr>';
 document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>changeState(b.dataset.id,b.dataset.state));
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function load(){setStatus('SYNC');const snap=await db.collection('users').orderBy('lastSeenAt','desc').limit(1000).get();current=snap.docs.map(d=>({id:d.id,...d.data()}));render();setStatus('ADMIN')}
async function changeState(id,state){if(!confirm(state==='banned'?'このユーザーをBANしますか？':state==='suspended'?'このユーザーを一時停止しますか？':'このユーザーをACTIVEへ戻しますか？'))return;await db.collection('users').doc(id).set({state,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});await load()}
async function init(){
 if(!configured){$('loginStatus').textContent='Firebase設定が未接続です。firebase-config.js を設定してください。';setStatus('SETUP REQUIRED');return}
 firebase.initializeApp(cfg);db=firebase.firestore();await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
 firebase.auth().onAuthStateChanged(async user=>{
   if(!user){$('loginPanel').hidden=false;$('console').hidden=true;setStatus('AUTH REQUIRED');return}
   const token=await user.getIdTokenResult(true);
   if(token.claims.admin!==true){$('loginStatus').textContent='このアカウントにはADMIN権限がありません。';await firebase.auth().signOut();return}
   $('loginPanel').hidden=true;$('console').hidden=false;await load();
 });
}
$('login').onclick=async()=>{try{$('loginStatus').textContent='';await firebase.auth().signInWithEmailAndPassword($('email').value.trim(),$('password').value)}catch(e){$('loginStatus').textContent=e.message}};
$('logout').onclick=()=>firebase.auth().signOut();$('refresh').onclick=load;$('search').oninput=render;init();
})();
