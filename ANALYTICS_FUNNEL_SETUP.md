# A.R.T ADMIN Acquisition Funnel setup

This branch adds a secure aggregate-only path from Google Analytics 4 to A.R.T ADMIN.

## Architecture

Acoustic M.C Tool -> GA4 -> GA4 Data API -> Cloudflare Worker -> A.R.T ADMIN

The Worker requires a valid Firebase ID token with the custom claim `admin: true`. Google Analytics service-account credentials remain only in Cloudflare secrets.

## Current deployment state

- GA4 collection is enabled and realtime reception has been confirmed.
- Google Analytics Data API is enabled for project `art-admin-ba592`.
- Dedicated GA viewer service account created:
  `a-r-t-admin-analytics-reader@art-admin-ba592.iam.gserviceaccount.com`
- GA4 property access: Viewer only, with cost and revenue metrics restricted.
- Cloudflare Worker created:
  `art-admin-analytics-api`
- Worker endpoint:
  `https://art-admin-analytics-api.4td64nzyfj.workers.dev/api/funnel`
- Worker code deployed.
- Required Worker variables/secrets are configured in production.
- Unauthenticated access correctly returns `Authentication required`.
- Authenticated production A.R.T ADMIN request with Firebase `admin: true` token returned HTTP 200.
- GA4 aggregate response shape was confirmed: `ok: true`, `totals`, and `source`.

## Worker environment

Configured in Cloudflare Worker Settings > Variables and Secrets:

- `FIREBASE_PROJECT_ID` = `art-admin-ba592`
- `GA4_PROPERTY_ID` = `557622748`
- `ALLOWED_ORIGIN` = `https://spaceflowdesign.github.io`
- `GA_CLIENT_EMAIL` = `a-r-t-admin-analytics-reader@art-admin-ba592.iam.gserviceaccount.com`
- `GA_PRIVATE_KEY` = service-account private key (**SECRET**)

Only `GA_PRIVATE_KEY` is stored as a secret. Do not commit the downloaded JSON key or private key to GitHub.

## Worker API

`GET /api/funnel?range=30d`

Accepted ranges: `1d`, `7d`, `30d`, `90d`.

Requires:

`Authorization: Bearer <Firebase admin ID token>`

Returns only aggregate values:

- visitors
- signupView
- signups
- toolStart
- registerRate
- toolStartRate
- source: x / note / direct / other

No email address, Firebase UID, audio, recording, image, analysis result or MEMO content is returned by this API.

## ADMIN integration

`admin-config.js` is configured to use:

`https://art-admin-analytics-api.4td64nzyfj.workers.dev/api/funnel`

Authenticated Worker/GA4 end-to-end verification has passed. The remaining release gate is merging PR37 and confirming the acquisition panel renders correctly in the production A.R.T ADMIN UI.

## Final cleanup

After the production A.R.T ADMIN UI is verified, delete the downloaded service-account JSON key from the local PC.
