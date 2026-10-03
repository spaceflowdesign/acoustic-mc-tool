/* A.R.T shared access configuration. Public Firebase web config only. */
window.AMC_FIREBASE_CONFIG={apiKey:"",authDomain:"",projectId:"",appId:""};
window.AMC_ACCESS_CONFIG={
  familyId:"acoustic",
  productId:"tool",
  families:{
    acoustic:{label:"A · Acoustic",enabled:true,products:{
      tool:{label:"Acoustic M.C Tool",enabled:true,maxDevices:2},
      analyzer:{label:"Acoustic M.C Analyzer",enabled:false,maxDevices:2}
    }},
    recording:{label:"R · Recording",enabled:false,products:{
      limited:{label:"R Limited",enabled:false,maxDevices:2},
      full:{label:"R Full",enabled:false,maxDevices:2}
    }},
    treatment:{label:"T · Treatment",enabled:false,products:{
      limited:{label:"T Limited",enabled:false,maxDevices:2},
      full:{label:"T Full",enabled:false,maxDevices:2}
    }}
  },
  adminEmail:"spaceflowdesign.jp@gmail.com"
};
