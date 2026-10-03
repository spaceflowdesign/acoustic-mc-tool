/* Acoustic M.C Tool access layer.
   Authentication/entitlement metadata only. Audio, video and analysis stay local. */
(() => {
  'use strict';
  const cfg = window.AMC_ACCESS_CONFIG || { maxDevices: 2 };
  const fb = window.AMC_FIREBASE_CONFIG || {};
  const configured = Boolean(fb.apiKey && fb.authDomain && fb.projectId && fb.appId);
  const state = { configured, user: null, profile: null };

  const deviceKey = 'amct_device_id_v1';
  function deviceId(){
    let id = localStorage.getItem(deviceKey);
    if(!id){ id = crypto.randomUUID ? crypto.randomUUID() : 'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2); localStorage.setItem(deviceKey,id); }
    return id;
  }
  function dispatch(name, detail={}){ window.dispatchEvent(new CustomEvent(name,{detail})); }
  function status(){ return {...state, deviceId:deviceId(), maxDevices:cfg.maxDevices||2}; }

  async function start(){
    if(!configured){ dispatch('amc-access-ready',status()); return status(); }
    if(!window.firebase?.apps) throw new Error('Firebase SDK is not loaded.');
    if(!firebase.apps.length) firebase.initializeApp(fb);
    const auth=firebase.auth(), db=firebase.firestore();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    return new Promise(resolve=>auth.onAuthStateChanged(async user=>{
      state.user=user||null; state.profile=null;
      if(user){
        const ref=db.collection('users').doc(user.uid);
        const snap=await ref.get();
        const data=snap.exists?snap.data():{};
        const accountState=data.state||'active';
        if(accountState==='banned'||accountState==='suspended'){
          state.profile={...data,state:accountState};
          dispatch('amc-access-blocked',status()); resolve(status()); return;
        }
        const devices={...(data.devices||{})}, id=deviceId();
        if(!devices[id]){
          const active=Object.entries(devices).filter(([,v])=>!v?.revoked);
          if(active.length >= (cfg.maxDevices||2)){
            state.profile={...data,devices};
            dispatch('amc-device-limit',status()); resolve(status()); return;
          }
          devices[id]={createdAt:firebase.firestore.FieldValue.serverTimestamp(),lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),label:navigator.platform||'device'};
        }else devices[id].lastSeenAt=firebase.firestore.FieldValue.serverTimestamp();
        await ref.set({email:user.email||'',state:accountState,devices,lastSeenAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        state.profile={...data,state:accountState,devices};
      }
      dispatch('amc-access-ready',status()); resolve(status());
    },err=>{dispatch('amc-access-error',{message:err.message});resolve(status());}));
  }
  async function signIn(email,password){ if(!configured) throw new Error('Firebase is not configured.'); return firebase.auth().signInWithEmailAndPassword(email,password); }
  async function signOut(){ if(configured) await firebase.auth().signOut(); }
  async function revokeDevice(id){
    if(!state.user) throw new Error('Authentication required.');
    const db=firebase.firestore(), ref=db.collection('users').doc(state.user.uid), snap=await ref.get(), data=snap.data()||{}, devices={...(data.devices||{})};
    if(devices[id]) devices[id]={...devices[id],revoked:true,revokedAt:firebase.firestore.FieldValue.serverTimestamp()};
    await ref.set({devices,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    return devices;
  }
  window.AMCAccess={start,signIn,signOut,revokeDevice,status,deviceId};
})();
