# Acoustic M.C shared access/admin setup

The access/admin layer is shared by the Acoustic M.C product family. Tool is active now; Analyzer is reserved as a separate product and stays hidden until enabled.

## Data model

One Firebase identity may hold independent product access:

```
users/{uid}
  email
  accountState
  products.tool
    state
    devices
    lastSeenAt
  products.analyzer
    state
    devices
    lastSeenAt
```

Product states are independent: active / suspended / banned. A future global account suspension/ban can use accountState.

## Production setup

1. Create/select one Firebase project for the Acoustic M.C product family.
2. Enable Authentication with the release sign-in provider.
3. Create Firestore.
4. Copy the Firebase Web App public configuration into firebase-config.js.
5. Deploy firestore.rules.
6. Set custom claim admin:true on the SPACE FLOW DESIGN administrator account from a trusted Admin SDK environment.
7. Re-authenticate the administrator.
8. Verify admin.html rejects a non-admin account.

## Fixed rules

- Tool maximum registered devices: 2.
- Analyzer has its own independent device set and can be enabled later.
- Normal releases do not intentionally sign users out.
- Users can revoke an old product-specific device when the limit is reached.
- Admin can suspend, ban or restore each product independently.
- Audio/video/analysis remain device-local. Firebase stores identity/access/operational metadata only.
- ADMIN UI is one shared console; Analyzer is hidden until released.
- ADMIN authorization uses a Firebase custom claim, never secrecy of the URL.

## Deployment note

GitHub Pages is static hosting. Before formal release, wire the access layer into the public Tool entry and verify Firebase rules/claims on a real device. This multi-product change does not modify completed audio/analysis behavior.
