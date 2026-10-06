# A.R.T ADMIN Acquisition Funnel setup

This branch adds a secure aggregate-only path from Google Analytics 4 to A.R.T ADMIN.

## Architecture

Acoustic M.C Tool -> GA4 -> GA4 Data API -> Cloudflare Worker -> A.R.T ADMIN

The Worker requires a valid Firebase ID token with the custom claim `admin: true`. Google Analytics service-account credentials remain only in Cloudflare secrets.

## Worker environment

Set these values in Cloudflare Worker Settings > Variables and Secrets:

- `FIREBASE_PROJECT_ID` = `art-admin-ba592`
- `GA4_PROPERTY_ID` = `557622748`
- `ALLOWED_ORIGIN` = `https://spaceflowdesign.github.io`
- `GA_CLIENT_EMAIL` = service-account email
- `GA_PRIVATE_KEY` = service-account private key (SECRET)

## Google side

1. Enable **Google Analytics Data API** in Google Cloud project `art-admin-ba592`.
2. Create a service account dedicated to A.R.T ADMIN analytics read access.
3. In Google Analytics property `art-admin-ba592`, add that service-account email as **Viewer** only.
4. Create a JSON key for that service account and copy only `client_email` and `private_key` into the Cloudflare Worker variables above.
5. Do not commit the JSON key or private key to GitHub.

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

## After deployment

Set the deployed Worker endpoint in `admin-config.js`, for example:

```js
window.ART_ANALYTICS_CONFIG={
  endpoint:"https://YOUR-WORKER.workers.dev/api/funnel",
  range:"30d"
};
```

Do not merge the ADMIN integration until the Worker returns a successful authenticated response.
