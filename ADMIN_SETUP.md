# Acoustic M.C access/admin setup

This repository now contains the client access layer and the separate administrator console. Production activation requires a Firebase project; no Firebase secret or Admin SDK credential belongs in this repository.

## Production setup

1. Create/select the Firebase project for Acoustic M.C.
2. Enable Authentication with the release sign-in provider.
3. Create Firestore.
4. Copy the Firebase Web App public configuration into `firebase-config.js`.
5. Deploy `firestore.rules`.
6. Set the Firebase Authentication custom claim `admin: true` on the SPACE FLOW DESIGN administrator account using a trusted Admin SDK environment. Never set this from browser JavaScript.
7. Re-authenticate the administrator after the claim is set.
8. Open `admin.html` and confirm that a non-admin account cannot enter the console.

## Fixed product rules

- Maximum registered devices: 2.
- Normal releases must not intentionally sign users out.
- A third device is blocked until an existing device is revoked.
- Users may revoke an old device when the limit is reached.
- Account states: `active`, `suspended`, `banned`.
- Admin may suspend, ban, or restore an account.
- Audio/video/analysis data remain device-local. Firebase stores identity/access/operational metadata only.
- Admin UI is separate from the user Tool.
- Admin authorization is a server-verified Firebase custom claim, not knowledge of the admin URL.

## Important deployment note

GitHub Pages is static hosting. The access layer must be wired into the public Tool entry before formal release so the Tool is not usable merely by bypassing a client-side screen. This commit deliberately does not change the completed audio/analysis implementation or its CSP until the Firebase project/provider is finalized.
