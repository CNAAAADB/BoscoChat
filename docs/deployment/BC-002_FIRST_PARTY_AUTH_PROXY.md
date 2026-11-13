# BC-002 — First-party authentication proxy (2026-11-13)

## Incident

Owner browser screenshots from https://boscochat.com showed an Administrator menu after login, but the authenticated `GET /api/admin/users` replied with `AUTHENTICATION_REQUIRED` (401). The frontend was connecting to `https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api` across sites; backend cookies are HTTP-only Secure SameSite=None. Modern browser third-party-cookie restrictions can prevent sending the session consistently, even if the login response is 200.

## Corrective deployment

- AWS Amplify app `dyqpe5eifx600`: prepend HTTPS 200 reverse-proxy rule `/api/<*>` → `https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api/<*>`, before SPA catchall `/<*>` → `/index.html`.
- Frontend build environment `VITE_API_URL=/api`; all frontend API clients use `/api` by default. Browser cookies are now first-party on `boscochat.com` and `www.boscochat.com` (distinct hostnames, require logging in separately).
- Amplify cacheConfig set to `AMPLIFY_MANAGED`, including cookies in the cache key for reverse-proxy paths (the prior `AMPLIFY_MANAGED_NO_COOKIES` is inappropriate for session data).
- Express sets `Cache-Control: private, no-store` on every `/api/*` response, including login and admin lists, preventing shared CDN caching of sensitive data and Set-Cookie responses.
- Existing API Gateway CORS allowlist remains limited to the 3 approved HTTPS hosting origins. Role checks remain unchanged: administrator only for user administration, historian only for historical PDF management, normal user only for search/viewing.
- Correct JSX role dropdown labels from mistakenly rendering whole role objects in the existing users list.

## Verification and release gates

- CI backend/frontend/MySQL and regression test `backend/test/first-party-api-cache.test.js`.
- Amplify release job succeeds after build-time `VITE_API_URL=/api` and rewrite configuration.
- **Browser validation required:** sign out and sign in again to establish new host-only first-party cookie. Confirm `/api/auth/session` and `/api/admin/users` 200 for an admin with session; confirm normal user 403 and anonymous 401. Confirm browser network requests go to `https://boscochat.com/api/…`, not `execute-api.amazonaws.com`.
- Also verify historiador's `GET /api/admin/historical/documents`, search and visual page viewer remain functional.
- If proxy does not forward Set-Cookie/Cookie reliably, revert `VITE_API_URL` to the prior execute-api endpoint and Amplify cache/rules and design a same-site custom API domain under `boscochat.com`.
- No account permissions, credentials, or archive documents are altered as part of this change.
