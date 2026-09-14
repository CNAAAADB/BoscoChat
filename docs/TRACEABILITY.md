# BoscoChat Traceability

Maintain links from user stories to design, implementation, tests and PRs.

| Story | Design / Mockup | Code / Components | Tests | PR | Verification | Security | Status |
|---|---|---|---|---|---|---|---|
| BC-001 (`RF-USER-01`, `RF-USER-02`, `RNF-SEC-01`, `RNF-SEC-03`) | DEC-001; no visual mockup required for existing auth forms | `backend/src/auth/`, `backend/src/routes/auth.js`, `backend/src/db/auth-repository.js`, `backend/scripts/migrate.js`, `frontend/src/App.jsx`, `frontend/src/api/auth.js` | `backend/test/password.test.js`, `backend/test/auth.integration.test.js`, `backend/test/config-security.test.js` | TRACE-GAP: PR pending | TRACE-GAP: independent verification pending | TRACE-GAP: independent FULL security review pending | IN_PROGRESS |

Use `TRACE-GAP` where required evidence is missing. Do not infer links that are not evidenced by repository artifacts or PR history.
