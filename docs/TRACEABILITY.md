# BoscoChat Traceability

Traceability is maintained from SRS requirement -> backlog story -> design -> implementation -> tests -> PR -> independent verification/security evidence.

Use `TRACE-GAP` where required evidence is missing. Do not infer links that are not evidenced by repository artifacts or PR history.

## Requirement to backlog mapping

| SRS requirement(s) | Story |
|---|---|
| RF-USER-01, RF-USER-02, RNF-SEC-01, RNF-SEC-03 | BC-001 |
| RF-USER-04, RF-ADMIN-01, RNF-SEC-03 | BC-002 |
| RF-USAGE-01, RF-USAGE-02, RF-USAGE-03 | BC-003 |
| RF-SUB-01, RF-SUB-02, RF-ADMIN-02 | BC-004 |
| RF-PAY-01, RF-PAY-02, RF-SUB-02 | BC-005 |
| RF-DOC-04, RF-DOCMGMT-01, RNF-SEC-02, RNF-SCALE-02, RNF-MAINT-01 | BC-006 |
| RF-DOCMGMT-01, RF-DOCMGMT-02, RF-DOCMGMT-04 | BC-007 |
| RF-SEARCH-01, RF-SEARCH-02, RF-SEARCH-03, RF-SEARCH-04, RNF-PERF-01 | BC-008 |
| RF-USER-03 | BC-009 |
| RF-SEARCH-05, RF-SEARCH-06, RF-SEARCH-07, RF-SEARCH-08, RF-SEARCH-09 | BC-010 |
| RF-SEARCH-10, RF-SEARCH-11, RF-SEARCH-12, RNF-USE-02 | BC-011 |
| RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04, RNF-SEC-02 | BC-012 |
| RF-ADMIN-03 | BC-013 |
| RF-CHAT-01, RF-CHAT-02, RF-CHAT-03, RF-CHAT-06, RNF-USE-02 | BC-101 |
| RF-RAG-01, RF-RAG-02, RF-RAG-05, RNF-PERF-02 | BC-102 |
| RF-RAG-03, RF-RAG-04, RF-CHAT-07 | BC-103 |
| RF-CHAT-04, RF-CHAT-05 | BC-104 |
| RF-DOCMGMT-03 | BC-201 |
| RF-ENTITY-01, RF-ENTITY-02 | BC-202 |
| RF-AI-01, RF-AI-03, RNF-DATA-02 | BC-203 |
| RF-AI-02, RF-AI-04, RNF-DATA-02 | BC-204 |

## Cross-cutting requirements

These are not considered complete from a single story and must be evidenced across applicable implementation/release work:

- RNF-PERF-03 — initial web load < 2 seconds.
- RNF-SCALE-01 — 50 initial concurrent users; architecture permits growth to 1,000-2,000.
- RNF-AVAIL-01 — minimum 90% normal-period availability.
- RNF-AVAIL-02 — maintenance minimizes user impact.
- RNF-DATA-01 — GDPR compliance.
- RNF-USE-01 — intuitive interface for non-technical users.
- RNF-MAINT-01 / RNF-MAINT-02 — modularity/extensibility.

## Delivery evidence

| Story | Design / Mockup | Code / Components | Tests | PR | Verification | Security | Status |
|---|---|---|---|---|---|---|---|
| BC-001 (`RF-USER-01`, `RF-USER-02`, `RNF-SEC-01`, `RNF-SEC-03`) | DEC-001; no visual mockup required for existing auth forms | `backend/src/auth/`, `backend/src/routes/auth.js`, `backend/src/db/auth-repository.js`, `backend/scripts/migrate.js`, `frontend/src/App.jsx`, `frontend/src/api/auth.js` | `backend/test/password.test.js`, `backend/test/auth.integration.test.js`, `backend/test/config-security.test.js` | #4 (implementation, merged 2026-09-14); #7/#8 (AWS runtime preparation and validated deployment documentation) | PASS: independent code/functional verification 2026-09-15; AWS end-to-end registration/login/session reload/logout validated 2026-09-15; representative staging migration remains a release-only TRACE-GAP | PASS for implementation: FULL source review 2026-09-15; production remains blocked until credential rotation/revocation and staging migration evidence | DONE |
| BC-002 (`RF-USER-04`, `RF-ADMIN-01`, `RNF-SEC-03`) | DEC-004; existing administration UI styling | `backend/src/users/`, `backend/src/middleware/authorization.js`, `backend/src/routes/admin-users.js`, `backend/src/auth/service.js`, `backend/src/db/auth-repository.js`, `frontend/src/api/users.js`, `frontend/src/App.jsx`, `backend/scripts/migrate.js` | Producer suite PASS on `a62f0dd`; orchestrator black-box privilege/suspension rerun PASS 2026-11-04; PR #17 aggregate-IP regressions and build/test/package CI PASS on exact SHA `e105577`; TRACE-GAP: distributed Lambda-instance test | #13 (merged 2026-11-02 while gates remained open); #17 (remediation, draft) | Partial PASS: privilege and suspension/session revocation; TRACE-GAP: distinct reviewer and representative MySQL migration/concurrency validation | HIGH `SEC-BC002-03 / CWE-400` intra-process remediation exact-SHA CI PASS but independent review pending; HIGH `SEC-BC002-04 / CWE-400`: process-local buckets are bypassable across horizontally scaling Lambda instances; audit-log policy pending | BLOCKED |
| BC-003 (`RF-USAGE-01`, `RF-USAGE-02`, `RF-USAGE-03`) | DEC-003 | `backend/src/usage/`, `backend/src/db/usage-repository.js`, `backend/src/routes/legacy.js`, `backend/scripts/migrate.js` | `backend/test/usage.test.js`, updated `backend/test/auth.integration.test.js` | #10 (merged 2026-09-17 while gate was BLOCKED) | Local rerun on remediated head: build/lint PASS, 19/19 tests; TRACE-GAP: independent functional verification of `c74dce1` pending | HIGH CWE-400 storage-amplification path remediated in `c74dce1`; TRACE-GAP: independent FULL confirmation and approved quota/reset plus query-log-retention policy pending | BLOCKED |
| BC-004 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-005 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-006 | `docs/proposals/BC-006-private-document-storage.md` (S3 private/SSE-KMS/backend proxy/minimum-privilege defaults proposed; human approvals pending) | PR #17 source-hash verifier; TRACE-GAP: no AWS storage/IaC/backend integration | PR #14 tool compilation and 5 regressions PASS on `880cbb0`; PR #17 local corpus compile and 8/8 tests PASS; authorized issues 766/767/768 retrieved, hashed, recorded and reverified by corpus CI on exact SHA `e105577` | #14 (merged 2026-11-02; test tooling/proposal only); #17 (remediation, draft) | Partial PASS: source hashes verified; TRACE-GAP: distinct reviewer, architecture approval and representative AWS verification | TRACE-GAP: KMS/IAM/access, retention, antimalware, audit and independent FULL review pending | BLOCKED |
| BC-007 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-008 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-009 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-010 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-011 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-012 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-013 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-101 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-102 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-103 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-104 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-201 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-202 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-203 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-204 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |


