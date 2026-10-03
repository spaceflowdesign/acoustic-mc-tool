/* Acoustic M.C shared product access layer.
   Identity/entitlement metadata only. Media and analysis remain device-local. */
(() => {
  'use strict';
  const cfg=window.AMC_ACCESS_CONFIG||{}, productId=cfg.productId||'tool';
  const product=cfg.products?.[productId]||{label:productId,maxDevices:2,enabled:true};
  const fb=window.AMC_FIREBASE_CONFIG||{}, configured=Boolean(fb.apiKey&&fb.authDomain&&fb.projectId&&fb.appId);
  const state={configured,productId,product,user:null,profile:null,access:null};
  const deviceKey='amc_device_id_v1';
  function deviceId(){let id=localStorage.getItem(deviceKey);if(!id){id=crypto.randomUUID?crypto.randomUUID():'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem(deviceKey,id)}return id}
  function dispatch(name,detail={}){window.dispatchEvent(new CustomEvent(name,{detail}))}
  function status(){return {...state,deviceId:deviceId(),maxDevices:product.maxDevices||2}}
  function productAccess(data){return data.products?.[productId]||{state:'active',devices:{}}}
  async function start(){
    if(!configured){dispatch('amc-access-ready',status());return status()}
    if(!window.firebase?.apps)throw new Error('Firebase SDK is not loaded.');
    if(!firebase.apps.length)firebase.initializeApp(fb);
    const auth=firebase.auth(),db=firebase.firestore();await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    return new Promise(resolve=>auth.onAuthStateChanged(async user=>{
      state.user=user||null;state.profile=null;state.access=null;
      if(user){
        const ref=db.collection('users').doc(user.uid),snap=await ref.get(),data=snap.exists?snap.data():{};
        const accountState=data.accountState||'active',access=productAccess(data),accessState=access.state||'active';
        state.profile=data;state.access=access;
        if(accountState==='banned'||accountState==='suspended'||accessState==='banned'||accessState==='suspended'||product.enabled===false){
          dispatch('amc-access-blocked',status());resolve(status());return;
        }
        const devices={...(access.devices||{})},id=deviceId(),max=product.maxDevices||2;
        if(!devices[id]){
          const active=Object.values(devices).filter(v=>!v?.revoked);
          if(active.length>=max){state.access={...access,devices};dispatch('amc-device-limit',status());resolve(status());return}
          devices[id]={createdAt:firebase.firestore.FieldValue.serverTimestamp(),lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),label:navigator.platform||'device'};
        }else devices[id].lastSeenAt=firebase.firestore.FieldValue.serverTimestamp();
        await ref.set({email:user.email||'',accountState,products:{[productId]:{...access,state:accessState,devices,lastSeenAt:firebase.firestore.FieldValue.serverTimestamp()}},lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        state.access={...access,state:accessState,devices};
      }
      dispatch('amc-access-ready',status());resolve(status());
    },err=>{dispatch('amc-access-error',{message:err.message});resolve(status())}))
  }
  async function signIn(email,password){if(!configured)throw new Error('Firebase is not configured.');return firebase.auth().signInWithEmailAndPassword(email,password)}
  async function signOut(){if(configured)await firebase.auth().signOut()}
  async function revokeDevice(id){
    if(!state.user)throw new Error('Authentication required.');
    const db=firebase.firestore(),ref=db.collection('users').doc(state.user.uid),snap=await ref.get(),data=snap.data()||{},access=productAccess(data),devices={...(access.devices||{})};
    if(devices[id])devices[id]={...devices[id],revoked:true,revokedAt:firebase.firestore.FieldValue.serverTimestamp()};
    await ref.set({products:{[productId]:{...access,devices}},updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});return devices
  }
  window.AMCAccess={start,signIn,signOut,revokeDevice,status,deviceId};
})();
