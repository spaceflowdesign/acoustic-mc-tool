# Acoustic M.C Passkey Setup

This document is the deployment checklist for the optional WebAuthn/passkey login added to Acoustic M.C Tool.

## Architecture

- Existing Firebase Authentication email/password remains the fallback.
- Passkeys use WebAuthn on the browser and `worker/passkey-auth.js` for server-side verification.
- A successful passkey assertion is exchanged for a Firebase custom token for the same Firebase UID.
- Firestore stores only the credential ID, public key, signature counter, Firebase UID, transports and timestamps.
- Private keys and Face ID / Touch ID biometric data never leave the user's device.

## Cloudflare Worker

Create a Worker named:

`art-passkey-auth`

Expected production URL for the current Cloudflare account:

`https://art-passkey-auth.4td64nzyfj.workers.dev`

Deploy the contents of:

`worker/passkey-auth.js`

## Required Worker variables / secrets

Set these values in Cloudflare Worker Settings -> Variables and Secrets:

- `ALLOWED_ORIGIN=https://spaceflowdesign.github.io`
- `WEBAUTHN_ORIGIN=https://spaceflowdesign.github.io`
- `WEBAUTHN_RP_ID=spaceflowdesign.github.io`
- `FIREBASE_PROJECT_ID=art-admin-ba592`
- `FIREBASE_CLIENT_EMAIL=<service account client_email>`
- `FIREBASE_PRIVATE_KEY=<service account private_key>`
- `PASSKEY_CHALLENGE_SECRET=<long random secret>`

Use a Firebase/Google service account that can read and write Firestore for this project and whose private key may be used to sign Firebase custom tokens. Keep the private key and challenge secret as Cloudflare secrets, not plain variables.

Generate `PASSKEY_CHALLENGE_SECRET` as at least 32 random bytes/characters.

## Firestore

The Worker writes credentials to the server-only collection:

`passkeyCredentials/{credentialId}`

Client Firestore rules do not grant access to this collection.

Before releasing the passkey build, publish the `firestore.rules` included in this branch because the privacy consent version is bumped to `2026-10-07-r3`.

## Release order

1. Publish the updated Firestore Rules.
2. Create/configure/deploy `art-passkey-auth`.
3. Confirm these endpoints return expected authentication errors rather than 404:
   - `POST /api/passkey/auth/options`
   - `POST /api/passkey/register/options`
4. Merge/deploy the Tool PR.
5. On iPhone Safari, log in with email/password once.
6. Open Menu -> Passkey Settings -> Register Passkey.
7. Log out.
8. Confirm Passkey Login succeeds with Face ID.
9. Confirm password login still works.
10. Confirm account deletion can reauthenticate with the passkey and removes the passkey credential.

## Acceptance criteria

- Existing Firebase UID and Firestore user record are unchanged after passkey login.
- An unregistered passkey cannot obtain a Firebase token.
- A withdrawn/inactive account cannot obtain a Firebase token even if an old credential record exists.
- Wrong origin or RP ID is rejected.
- User verification is required.
- Only ES256/P-256 passkeys are accepted.
- Password login remains available as fallback.
- Removing all passkeys does not remove the Firebase account.
- Deleting the Firebase account removes passkey credential records first.
