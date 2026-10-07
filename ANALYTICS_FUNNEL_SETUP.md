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
- PR37 was merged to `main`.
- Production A.R.T ADMIN acquisition/funnel panel was visually verified after deployment.
- Production panel displayed VISITORS / SIGNUP VIEW / SIGNUPS / TOOL START / REGISTER RATE / TOOL START RATE and source breakdown (X / note / direct / other).

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

Authenticated Worker/GA4 end-to-end verification has passed. PR37 is merged and the acquisition panel renders correctly in the production A.R.T ADMIN UI.

## Final cleanup

Production UI verification is complete. The downloaded service-account JSON key was deleted from the local PC after the Cloudflare secret was verified.


## Funnel metric definition update

As of the unique-user funnel update, VISITORS / SIGNUP VIEW / SIGNUPS / TOOL START are all GA4 `totalUsers` based metrics. X / note / direct / other remain GA4 `sessions` and are displayed in a separate source-session block. This avoids mixing user counts and event counts in one funnel.


## Sequential funnel update

The acquisition panel now uses the GA4 Data API `runFunnelReport` closed funnel for the four primary stages:

1. VISITORS: `page_view` on `/acoustic-mc-tool/`
2. SIGNUP VIEW: `signup_view`
3. SIGNUPS: `sign_up`
4. TOOL START: `tool_start`

A user is counted in a later stage only if the same GA4 user passed the earlier stages in order during the selected date range. Intermediate unrelated events are allowed. The source block remains session-based (`sessions`) and is intentionally separate.

Note: GA4 funnel reporting is provided by the Data API v1alpha `runFunnelReport` method; monitor for API changes.


## Funnel entry filter compatibility fix

GA4 Data API v1alpha does not currently allow `pagePath` as a funnel-step field filter. The VISITORS step therefore matches the `page_view` event and filters its `page_location` event parameter for `/acoustic-mc-tool/`. This preserves Tool-only entry filtering while using a filter type supported inside funnel event filters.
