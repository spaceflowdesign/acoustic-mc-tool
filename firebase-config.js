/* Acoustic M.C shared access layer configuration.
   Public Firebase web configuration only; never put Admin SDK keys here. */
window.AMC_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};
window.AMC_ACCESS_CONFIG = {
  productId: "tool",
  products: {
    tool: { label: "Acoustic M.C Tool", enabled: true, maxDevices: 2 },
    analyzer: { label: "Acoustic M.C Analyzer", enabled: false, maxDevices: 2 }
  },
  adminEmail: "spaceflowdesign.jp@gmail.com"
};
