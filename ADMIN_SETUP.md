# A.R.T shared access/admin setup

One administration foundation serves the full A.R.T hierarchy. Only released families/products are shown.

## Hierarchy

```
A.R.T
├─ acoustic
│  ├─ tool       Acoustic M.C Tool
│  └─ analyzer   Acoustic M.C Analyzer
├─ recording
│  ├─ limited    reserved
│  └─ full       reserved
└─ treatment
   ├─ limited    reserved
   └─ full       reserved
```

R/T public product names are intentionally not fixed by this implementation. Internal IDs are placeholders that can be relabeled later.

## User data

```
users/{uid}
  accountState
  families.acoustic.state
  families.acoustic.products.tool.{state,devices,lastSeenAt}
  families.acoustic.products.analyzer.{state,devices,lastSeenAt}
  families.recording.products.limited/full
  families.treatment.products.limited/full
```

State can therefore be evaluated at account → family → product level. Product operations are implemented now; account/family state is reserved for future whole-A.R.T or A/R/T-level suspension/BAN.

## Current release

- A / Acoustic is enabled.
- Acoustic M.C Tool is enabled.
- Analyzer is reserved but hidden.
- R and T are reserved and hidden.
- Tool device limit remains 2.
- Media/analysis remain local.
- ADMIN remains one shared console.
- Firebase custom claim admin:true protects ADMIN authority.

## Production setup

Create one Firebase project for A.R.T, enable the chosen Authentication provider and Firestore, place the public Web App configuration in firebase-config.js, deploy firestore.rules, set admin:true on the SPACE FLOW DESIGN administrator from a trusted Admin SDK environment, then re-authenticate and test both admin and non-admin accounts.
