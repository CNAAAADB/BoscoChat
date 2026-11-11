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
| TRACE-GAP — proposed scope; product-owner and SRS-baseline approval pending | BC-014 |
| TRACE-GAP — proposed scope; product-owner and SRS-baseline approval pending | BC-015 |
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

## Baseline conflicts and active TRACE-GAPs

- PR #20/#23 implement feature-flagged anonymous archive discovery, while RF-USER-03 and the current BC-008/BC-009 criteria prohibit unauthenticated search execution. Product conversation evidence does not replace an approved SRS-baseline change.
- Owner-supplied AWS console observations record SSE-S3, while `docs/proposals/BC-006-private-document-storage.md` proposes mandatory SSE-KMS. No approved decision reconciles the two.
- No merged artifact supplies independent review, real archive ingestion, a successful Lambda S3 read, representative end-to-end search/view evidence or watermark verification.

## Delivery evidence

| Story | Design / Mockup | Code / Components | Tests | PR | Verification | Security | Status |
|---|---|---|---|---|---|---|---|
| BC-001 (`RF-USER-01`, `RF-USER-02`, `RNF-SEC-01`, `RNF-SEC-03`) | DEC-001; no visual mockup required for existing auth forms | `backend/src/auth/`, `backend/src/routes/auth.js`, `backend/src/db/auth-repository.js`, `backend/scripts/migrate.js`, `frontend/src/App.jsx`, `frontend/src/api/auth.js` | `backend/test/password.test.js`, `backend/test/auth.integration.test.js`, `backend/test/config-security.test.js` | #4 (implementation, merged 2026-09-14); #7/#8 (AWS runtime preparation and validated deployment documentation) | PASS: independent code/functional verification 2026-09-15; AWS end-to-end registration/login/session reload/logout validated 2026-09-15; representative staging migration remains a release-only TRACE-GAP | PASS for implementation: FULL source review 2026-09-15; production remains blocked until credential rotation/revocation and staging migration evidence | DONE |
| BC-002 (`RF-USER-04`, `RF-ADMIN-01`, `RNF-SEC-03`) | DEC-001, DEC-004; existing administration UI styling | `backend/src/users/`, `backend/src/middleware/authorization.js`, `backend/src/routes/admin-users.js`, `backend/src/auth/service.js`, `backend/src/db/auth-repository.js`, `backend/src/db/auth-rate-limit-store.js`, `frontend/src/api/users.js`, `frontend/src/App.jsx`, `backend/scripts/migrate.js` | Producer suite PASS on `a62f0dd`; orchestrator privilege/suspension rerun PASS 2026-11-04; PR #17 local 37/37 and producer CI PASS; MySQL 8 migration plus concurrent shared-limiter/last-administrator/session-revocation test PASS | #13 (merged 2026-11-02 while gates remained open); #17 (merged 2026-11-10 despite blocking gate) | Partial PASS: privileges, suspension/session revocation and MySQL 8 producer CI; TRACE-GAP: distinct reviewer plus representative staging/distributed-load validation | HIGH `SEC-BC002-03` and `SEC-BC002-04 / CWE-400` remediation is on `main`; findings remain open until distinct FULL review and representative staging/load verification; HMAC provisioning and audit-log policy pending | BLOCKED |
| BC-003 (`RF-USAGE-01`, `RF-USAGE-02`, `RF-USAGE-03`) | DEC-003 | `backend/src/usage/`, `backend/src/db/usage-repository.js`, `backend/src/routes/legacy.js`, `backend/scripts/migrate.js` | `backend/test/usage.test.js`, updated `backend/test/auth.integration.test.js` | #10 (merged 2026-09-17 while gate was BLOCKED) | Local rerun on remediated head: build/lint PASS, 19/19 tests; TRACE-GAP: independent functional verification of `c74dce1` pending | HIGH CWE-400 storage-amplification path remediated in `c74dce1`; TRACE-GAP: independent FULL confirmation and approved quota/reset plus query-log-retention policy pending | BLOCKED |
| BC-004 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-005 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-006 | `docs/proposals/BC-006-private-document-storage.md` (S3 private/SSE-KMS/backend proxy/minimum-privilege proposal); owner-supplied console observations in PR #18/#20 | Source-hash verifier; annual-key parser; disabled S3 probe; archive schema/importer; protected page/PDF proxy prototypes | PR #17 corpus/hash CI PASS; PR #19/#20/#21/#23 producer CI PASS; unit/integration tests use simulated/local providers | #14/#17/#18/#19/#20/#21/#23 merged; #22 closed unmerged | Partial PASS: source hashes and code-level tests; TRACE-GAP: real Lambda `GetObject`, archive migration/ingestion, representative AWS/backend verification and distinct reviewer | TRACE-GAP: SSE-S3 vs SSE-KMS decision, IaC, KMS/IAM negative tests, retention, antimalware, audit, RPO/RTO and independent FULL review | BLOCKED |
| BC-007 | `docs/deployment/S3_ARCHIVE_FIRST_INGESTION.md` | `backend/scripts/migrate-archive.js`, `backend/scripts/ingest-archive-pdf.js`, `backend/src/documents/archive-keys.js`, `backend/src/documents/extracted-pages.js` | Parser/extraction/search producer tests PASS; TRACE-GAP: no representative migration/ingestion run | #19/#20 merged 2026-11-10 | TRACE-GAP: real annual PDF ingestion, upload authorization, retry/diagnostics, OCR correction and audit trail | TRACE-GAP: independent review, worker isolation/IAM/RDS validation and malicious-PDF controls | BLOCKED |
| BC-008 | Feature-flagged frontend flow; no approved design change for anonymous execution | `backend/src/documents/archive-search.js`, `backend/src/routes/archive-search.js`, `frontend/src/App.jsx` | Producer tests cover required plain terms, annual filter and ten-result limit; TRACE-GAP: exact phrase, explicit AND/OR, real corpus and <2s evidence | #20/#23 merged 2026-11-10 | TRACE-GAP: feature disabled, no representative ingestion/query or independent verification; anonymous execution conflicts with RF-USER-03 | TRACE-GAP: distributed public anti-abuse/rate limiting, monitoring, fragment exposure review and independent FULL review | BLOCKED |
| BC-009 | Feature-flagged login handoff | `frontend/src/App.jsx`, authenticated page route | Producer tests cover anonymous preview and authenticated page access | #20/#23 merged 2026-11-10 | TRACE-GAP: selected document/page is retained, not the entered query; no end-to-end verification; anonymous execution conflicts with RF-USER-03 | TRACE-GAP: temporary state/privacy and independent review | BLOCKED |
| BC-010 | TRACE-GAP | Partial annual filter in archive search/frontend | Producer test covers annual filter only | #20 merged 2026-11-10 (partial) | TRACE-GAP: publication, issue, date range, author, section and combination evidence missing | TRACE-GAP | READY |
| BC-011 | TRACE-GAP | Partial ten-result fragment/publication/year/page preview in backend/frontend | Producer preview tests PASS | #20 merged 2026-11-10 (partial) | TRACE-GAP: highlighting, issue/full date, approved UX and representative source links | TRACE-GAP: fragment exposure review | READY |
| BC-012 | TRACE-GAP | Authenticated page-text route plus disabled S3 byte-range PDF proxy and iframe | Producer tests cover authentication and bounded range behavior with simulated providers | #20/#23 merged 2026-11-10 | TRACE-GAP: real S3/API Gateway read, source-page opening, navigation/zoom/scroll, large PDFs, cookies/CSP and independent verification | TRACE-GAP: watermark, capture/download controls, AWS authorization and independent FULL review | BLOCKED |
| BC-013 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-014 | TRACE-GAP: measurable draft criteria; SRS baseline missing | TRACE-GAP | TRACE-GAP | #17 (documentation only; no implementation) | TRACE-GAP | TRACE-GAP: profile privacy/authorization review pending | IDEA |
| BC-015 | TRACE-GAP: measurable draft criteria; SRS baseline/provider policy missing | TRACE-GAP | TRACE-GAP | #17 (documentation only; no implementation) | TRACE-GAP | TRACE-GAP: token/email security and privacy review pending | IDEA |
| BC-101 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-102 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-103 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-104 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-201 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-202 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-203 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-204 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |


