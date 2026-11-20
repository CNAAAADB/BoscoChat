# BoscoChat Backlog

This file is the product/work source of truth. It is seeded from `docs/requirements/SRS_BoscoChat.md` and preserves the original SRS requirement IDs for traceability.

## Status values
`IDEA` | `READY` | `IN_PROGRESS` | `BLOCKED` | `IN_REVIEW` | `DONE`

## Priority values
`P0` critical | `P1` high | `P2` normal | `P3` low

## Delivery phases

- **Phase 1 / MVP:** documentary search platform.
- **Phase 2:** conversational AI / RAG.
- **Phase 3:** visual analysis and historical entities.

---

### BC-105 — Monthly PDF fragmentation for Gestión histórica
- Priority: P1
- Status: IN_REVIEW
- Owner role: Developer
- Depends on: BC-007, BC-017
- SRS: RF-DOCMGMT-01, RF-DOCMGMT-02, RF-SEARCH-06, RF-SEARCH-07, RF-SEARCH-11, RF-SEARCH-12, RF-RAG-03, RF-RAG-04
- Design/mockup: docs/design/BC-105_MONTHLY_FRAGMENTATION.md
- Issue: #80
- PR: pending

**Story**
As a historian or administrator, I want to scan annual PDF collections for issue boundaries, review/edit monthly segments, and publish separate searchable issue PDFs without losing the original.

**Acceptance criteria**
- [x] Authenticated role-restricted, feature-flagged scan proposal from indexed PDF OCR.
- [x] Editable page ranges, issue number and month span; split/merge and coverage validation.
- [x] Private PDF splitting via qpdf in worker; source preserved and S3 output never overwritten.
- [x] Transactional activation of child indexes with source tombstone to prevent delayed reingestion.
- [x] Issue/month metadata returned to archive search.
- [ ] CI and independent security/integration verification on exact PR head.
- [ ] Representative scanned annual PDF and OCR fallback validation.
- [ ] Apply and verify additive MySQL migration; publish new worker with qpdf and IAM GetObjectVersion/PutObject; enable flags in AWS only after staging.
- [ ] Recover abandoned or failed fragments, implement operational job timeout/recovery and rollback drills.

**Limitations / gate:** Detection currently uses OCR pages already indexed in MySQL, not visual cover detection or new OCR for image-only originals. Low-confidence output MUST be reviewed; a single detected issue is never split automatically. Feature flags remain disabled by default. No claim of production readiness.

---

# Phase 1 — MVP

### BC-001 — User registration and authentication
- Priority: P1
- Status: DONE
- Owner role: Developer
- Depends on: -
- SRS: RF-USER-01, RF-USER-02, RNF-SEC-01, RNF-SEC-03
- Design/mockup: TBD
- PR: #4

**Story**  
As a visitor, I want to register and authenticate securely so that I can access BoscoChat functionality.

**Acceptance criteria**
- [x] Registration accepts username, email and password.
- [x] Duplicate email registration is rejected.
- [x] New accounts receive the Free role by default.
- [x] Login accepts email/password and rejects invalid credentials.
- [x] Passwords are stored using an appropriate password-hashing mechanism, never plaintext.
- [x] Authentication/session controls are enforced server-side.
- [x] Automated tests cover successful and failed registration/login paths.

**Security / privacy considerations**
- Personal data and credentials; GDPR/privacy by design.
- Rate-limit or otherwise protect authentication attempts.
- Release constraint (not a development dependency): production deployment remains prohibited until the previously exposed MySQL credential is rotated/revoked and the migration/restore procedure is validated on representative staging data.

### BC-002 — Roles and authorization
- Priority: P1
- Status: BLOCKED
- Owner role: Developer
- Depends on: BC-001
- SRS: RF-USER-04, RF-ADMIN-01, RNF-SEC-03
- Design/mockup: TBD
- PR: #13 (merged), follow-up three-profile and password reset PR pending

**Story**  
As the platform, I want role-based authorization so that users only access functions permitted for their role.

**Acceptance criteria**
- [x] Support Free, Pro, Premium, Advanced, Administrator and Documentary manager roles.
- [x] Authorization is enforced by the backend, not only by the UI.
- [x] Administrator can create accounts, modify roles, suspend accounts and delete accounts.
- [x] Unauthorized operations return safe, consistent errors.
- [x] Tests prove privilege boundaries for protected operations, including the concurrent last-active-administrator invariant.

**Gate status**
- Implementation is present on `main` through PR #13 and its producer CI passed on `a62f0dd`.
- [x] Orchestrator rerun on 2026-11-04: independent black-box privilege and suspension/session-revocation checks PASS against materialized `a62f0dd`; this does not replace a distinct Verifier identity.
- [ ] Independent verification by a distinct reviewer identity on the exact remediated SHA.
- [ ] Independent FULL authorization/security review on the exact remediated SHA.
- [x] MySQL 8 engine-level CI migration/concurrency validation.
- [ ] Representative staging migration and distributed-load validation.
- [ ] Approve access, retention and deletion policy for personal identifiers in `admin_audit_logs`.
- HIGH `SEC-BC002-03 / CWE-400`: rotating email values bypassed the original `IP|email` authentication limiter and could force unbounded password-hash work from one source IP. PR #17 retains an aggregate-IP regression and now uses opaque HMAC bucket keys; exact-head CI and distinct independent FULL verification remain required.
- HIGH `SEC-BC002-04 / CWE-400`: PR #17 now implements a MySQL-backed fixed-window store shared across Lambda instances, fails closed in production without that store or a 32-byte HMAC key, and adds a two-instance regression. CI now passes the migration and concurrent limiter/last-administrator/session-revocation tests on MySQL 8. The remediation is not accepted yet: representative staging/load evidence and a distinct independent FULL security review are `TRACE-GAP`.
- A merged PR does not satisfy these gates; BC-002 remains `BLOCKED`.

**2026-11-13 product-owner role refinement (in review):** Only three visible/assignable access profiles: administrator, historian (`documentary_manager`), normal user (`free`); existing `pro/premium/advanced` roles preserved as ordinary read-only-search accounts. Admin can create/delete/suspend, assign these three roles and issue an expiring one-use password reset link. Historians and administrators can access BC-017 Gestión histórica, by the owner's subsequent explicit decision on 2026-11-13. The reset schema migration, audit/privacy review, staging tests and independent FULL security review are outstanding, therefore BC-002 stays BLOCKED. Details: `docs/design/BC-002_THREE_PROFILES_AND_PASSWORD_RESET.md`. SRS RF-USER-04 reconciliation is TRACE-GAP.

### BC-003 — Query usage logging and quotas
- Priority: P1
- Status: BLOCKED
- Owner role: Developer
- Depends on: BC-001
- SRS: RF-USAGE-01, RF-USAGE-02, RF-USAGE-03
- Design/mockup: TBD
- PR: #10 (merged 2026-09-17 while the delivery gate was BLOCKED)

**Gate status**
- Code is present on `main`, but story completion remains blocked pending independent functional verification of the remediated head, independent FULL security confirmation of `c74dce1`, and explicit approval or exception acceptance for production quota/reset values and query-log retention.

**Story**  
As BoscoChat, I want to record and enforce per-plan query quotas so that use and operating costs can be controlled.

**Acceptance criteria**
- [x] Search and conversational queries are counted separately.
- [x] Query records include user, type, timestamp and parameters.
- [x] Periodic limits can be configured per plan.
- [x] Requests beyond the limit are blocked.
- [x] User receives a clear limit/upgrade message.
- [x] Tests cover counters, reset-period behavior and exceeded limits.

### BC-004 — Subscription plans
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-001, BC-003
- SRS: RF-SUB-01, RF-SUB-02, RF-ADMIN-02
- Design/mockup: TBD
- PR: -

**Story**  
As a user, I want a subscription plan with defined limits and functionality so that I can use the level of service associated with my account.

**Acceptance criteria**
- [ ] Support Free, Pro, Premium and Advanced plans.
- [ ] Each plan defines search quota, conversational quota and available functionality.
- [ ] User can request an upgrade to a higher plan.
- [ ] Administrator can inspect and modify subscription state when necessary.

### BC-005 — Payment gateway and subscription events
- Priority: P1
- Status: IDEA
- Owner role: Developer
- Depends on: BC-004
- SRS: RF-PAY-01, RF-PAY-02, RF-SUB-02
- Design/mockup: TBD
- PR: -

**Story**  
As a paying user, I want subscription payments and renewals handled by an external gateway so that paid plans are activated and maintained automatically.

**Acceptance criteria**
- [ ] Integrate the approved payment gateway.
- [ ] Handle confirmed payment, renewal, cancellation and payment failure events.
- [ ] Apply paid-plan changes only after verified payment events.
- [ ] Webhook/event processing is authenticated/idempotent.
- [ ] No sensitive payment-card data is stored by BoscoChat unless explicitly required by the provider model.

**Notes**
- The SRS architecture diagram names Stripe; confirm provider/configuration before implementation if not already decided.

### BC-006 — Documentary data model and protected storage
- Priority: P1
- Status: BLOCKED
- Owner role: Developer
- Depends on: -
- SRS: RF-DOC-04, RF-DOCMGMT-01, RNF-SEC-02, RNF-SCALE-02, RNF-MAINT-01
- Design/mockup: docs/proposals/BC-006-private-document-storage.md (proposed, not approved)
- PR: #14, #17, #18, #19, #20, #21 and #23 (merged artifacts; delivery gate remains BLOCKED)

**Story**  
As the platform, I want a structured documentary data model and protected document storage so that historical publications can be ingested and served securely.

**Acceptance criteria**
- [ ] Model at least Publication, Publication issue, Page, Text fragment, User, Subscription and Query log as required for MVP.
- [ ] Store document references/metadata required by the SRS.
- [ ] Original documents are not publicly/directly accessible.
- [ ] Backend authorizes access before serving document content.
- [ ] Architecture supports adding new publications without redesigning the core data model.

**Gate status**
- PR #17 merged on 2026-11-10 despite its recorded `BLOCKED / TRACE-GAP — do not merge` gate and zero submitted reviews. Its source-hash verifier and the three authorized catalog SHA-256 values are now on `main`.
- PR #18 records owner-supplied AWS-console evidence for a private S3 bucket, Block Public Access, versioning, SSE-S3 and a manual upload in progress. This is documentary evidence, not an independently verified deployment.
- PR #19 adds annual-key parsing. PR #20 adds archive schema/import/search/viewer components. PR #21 adds a disabled-by-default administrator S3 header probe. PR #23 mounts the search and document routes behind disabled-by-default feature flags.
- Producer CI passed on PR #17, #19, #20, #21 and #23; PR #18 had no workflow. None of PR #17–#23 has a submitted review.
- No repository evidence shows a successful Lambda `GetObject`, archive migration, real ingestion into RDS, representative backend document read, IaC deployment, negative AWS access tests or independent FULL review.
- The owner-supplied environment uses SSE-S3 while the current BC-006 proposal requires SSE-KMS; the encryption baseline and remaining cloud/privacy decisions are unresolved.
- BC-006 remains `BLOCKED`. Merges and disabled diagnostic/prototype code do not satisfy its acceptance criteria.

### BC-007 — Document upload and ingestion pipeline
- Priority: P1
- Status: BLOCKED
- Owner role: Developer
- Depends on: BC-002, BC-006
- SRS: RF-DOCMGMT-01, RF-DOCMGMT-02, RF-DOCMGMT-04
- Design/mockup: TBD
- PR: #19 and #20 (merged 2026-11-10; partial tooling only)

**Story**  
As a Documentary manager, I want to upload historical publication PDFs and ingest their OCR content so that they become searchable.

**Acceptance criteria**
- [ ] Only Documentary manager or Administrator can upload documents.
- [ ] Upload captures publication, issue/volume, date and optional author/section metadata.
- [ ] Ingestion stores the PDF, creates page representations, imports/extracts OCR, chunks text and indexes fragments.
- [ ] Documentary manager can correct page OCR.
- [ ] OCR corrections retain an audit trail and update affected search data.
- [ ] Failed ingestion leaves a diagnosable/retryable state rather than silently succeeding.

**Gate status**
- Parser, archive schema, one-PDF importer and text-extraction helpers are present on `main`.
- The migration and importer have not been executed against a representative AWS/RDS environment; no real annual PDF has been independently shown as ingested or searchable.
- Upload authorization, ingestion retry/diagnostics, OCR correction and correction audit-trail acceptance criteria remain unevidenced.
- Dependencies BC-002 and BC-006 are not `DONE`; independent functional/security review is absent.

### BC-008 — Keyword, phrase and logical search
- Priority: P1
- Status: DONE
- Owner role: Developer
- Depends on: BC-007
- SRS: RF-SEARCH-01, RF-SEARCH-02, RF-SEARCH-03, RF-SEARCH-04, RNF-PERF-01
- Design/mockup: TBD
- PR: #20 and #23 (merged 2026-11-10; feature disabled by default)

**Story**  
As a registered user, I want to search the OCR corpus using words, exact phrases and logical operators so that I can locate relevant historical content.

**Acceptance criteria**
- [ ] Unauthenticated users cannot execute a search.
- [ ] Multiple plain terms default to requiring all terms.
- [ ] Quoted text performs exact phrase search.
- [ ] AND and OR are supported, including combined expressions.
- [ ] Results are relevance ordered.
- [ ] Indexed search target is under 2 seconds under the defined normal test conditions.
- [ ] Search syntax and edge cases have automated tests.

**Gate status**
- A MySQL FULLTEXT word-search prototype, annual filter, ten-result preview and React integration are present on `main`, but `ARCHIVE_PUBLIC_SEARCH_ENABLED` / `VITE_ARCHIVE_SEARCH` remain disabled by default.
- No real archive migration/ingestion, representative query evidence, performance evidence, exact-phrase support or explicit AND/OR support has been verified.
- The anonymous-search behavior introduced by PR #20 conflicts with RF-USER-03 and the current criterion that unauthenticated users cannot execute a search. It remains a `TRACE-GAP` until the approved SRS/backlog baseline is changed or the implementation is aligned.
- Public anti-abuse/rate-limit controls and independent functional/security review are missing.

**Aceptación funcional del responsable (2026-11-19).** Se acepta el buscador por palabras/frases y modos que usa la web; sigue pendiente validación independiente de todos los operadores, latencia y conciliación del descubrimiento público con RF-USER-03. Evidencias no existentes no se dan por superadas; se trasladan al seguimiento BC-018.

### BC-009 — Preserve query through authentication
- Priority: P1
- Status: BLOCKED
- Owner role: Developer
- Depends on: BC-001, BC-008
- SRS: RF-USER-03
- Design/mockup: TBD
- PR: #20 and #23 (merged 2026-11-10; scope conflict and feature flag)

**Story**  
As an unauthenticated visitor, I want my entered search retained while I log in/register so that it executes after successful authentication.

**Acceptance criteria**
- [ ] Search execution is blocked before authentication.
- [ ] Login and registration choices are presented.
- [ ] Entered query is retained temporarily.
- [ ] Query executes automatically after successful authentication.
- [ ] Temporary query data is not retained longer than necessary.

**Gate status**
- The feature-flagged frontend retains a selected document/page through login, but this is not an end-to-end verified preservation of the entered query required by RF-USER-03.
- The merged anonymous-search flow executes search before authentication, contradicting the current SRS/backlog baseline.
- BC-008 is `BLOCKED`; product-baseline approval and independent verification are pending.

### BC-010 — Documentary search filters
- Priority: P1
- Status: DONE
- Owner role: Developer
- Depends on: BC-008
- SRS: RF-SEARCH-05, RF-SEARCH-06, RF-SEARCH-07, RF-SEARCH-08, RF-SEARCH-09
- Design/mockup: TBD
- PR: #20 (merged partial annual filter only; story remains incomplete)

**Story**  
As a registered user, I want to filter search results by documentary metadata so that I can narrow the corpus efficiently.

**Acceptance criteria**
- [ ] Filter by one or more publications.
- [ ] Filter by publication issue/number.
- [ ] Filter by date range.
- [ ] Filter by author when metadata exists.
- [ ] Filter by editorial section when metadata exists.
- [ ] Filters combine correctly with search syntax.

**Aceptación funcional del responsable (2026-11-19).** Se aceptan los filtros disponibles en la web; verificar por separado cobertura específica de publicación, número, fechas, autor y sección antes de afirmar cumplimiento íntegro del SRS. Evidencias no existentes no se dan por superadas; se trasladan al seguimiento BC-018.

### BC-011 — Search result presentation
- Priority: P1
- Status: DONE
- Owner role: Developer
- Depends on: BC-008, BC-010
- SRS: RF-SEARCH-10, RF-SEARCH-11, RF-SEARCH-12, RNF-USE-02
- Design/mockup: TBD
- PR: #20 (merged partial preview only; story remains incomplete)

**Story**  
As a registered user, I want search results to show highlighted fragments and source metadata so that I can evaluate relevance and open the original source.

**Acceptance criteria**
- [ ] Show matching OCR fragment.
- [ ] Visually highlight matching terms/phrases.
- [ ] Show publication, issue number, publication date and page number.
- [ ] Provide an action to open the original in the integrated viewer.
- [ ] Presentation is clear and understandable.
- [ ] Results support server-side pagination, 10 by default, with 10/20/50 per page, total count and previous/next navigation (implementation PR pending verification).

**Aceptación funcional del responsable (2026-11-19).** Se acepta presentación, enlaces, fragmentos y paginación 10/20/50; quedan pendientes pruebas independientes de metadatos, resaltado y rendimiento. Evidencias no existentes no se dan por superadas; se trasladan al seguimiento BC-018.

### BC-012 — Protected integrated PDF viewer
- Priority: P1
- Status: DONE
- Owner role: Developer
- Depends on: BC-006, BC-011
- SRS: RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04, RNF-SEC-02
- Design/mockup: TBD
- PR: #20 and #23 (merged prototype; disabled by default)

**Story**  
As a registered user, I want to view original documents inside BoscoChat on the relevant page without receiving a direct downloadable document URL.

**Acceptance criteria**
- [ ] Integrated viewer supports page navigation, zoom and page scrolling.
- [ ] Opening from a search result positions the viewer on the relevant page.
- [ ] Direct external/public document access is denied.
- [ ] Backend verifies authorization before serving content.
- [ ] Viewer does not expose a direct download action.
- [ ] Invisible user-associated watermarking required by RF-DOC-03 is implemented and verified.

**Gate status**
- Authenticated page-text retrieval and a bounded S3 byte-range PDF proxy prototype are present on `main`.
- `ARCHIVE_PDF_VIEW_ENABLED` / `VITE_ARCHIVE_PDF_VIEW` remain disabled by default.
- No successful real S3 read, API Gateway/Lambda binary-range test, cross-site cookie/CSP validation, large-PDF test, source-page end-to-end validation, per-user range-request abuse/cost control or watermark evidence exists.
- BC-006 and BC-011 are not `DONE`; independent functional/security review is missing.

**Aceptación funcional del responsable (2026-11-19).** Se acepta el visor integrado y la apertura desde resultados; persisten comprobaciones independientes de marca invisible, prevención de descarga, rangos, móviles y autorización. Evidencias no existentes no se dan por superadas; se trasladan al seguimiento BC-018.

### BC-013 — Administration monitoring
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: BC-002, BC-003
- SRS: RF-ADMIN-03
- Design/mockup: TBD
- PR: -

**Story**  
As an Administrator, I want usage and resource monitoring so that I can supervise platform operation.

**Acceptance criteria**
- [ ] Show query counts.
- [ ] Show conversational usage when Phase 2 exists.
- [ ] Show user activity indicators.
- [ ] Show system-resource/operational metrics available from the deployed environment.

### BC-016 — Official BoscoChat domain and HTTPS
- Priority: P1
- Status: IDEA
- Owner role: Product / Developer
- Depends on: current Amplify/API Gateway deployment
- SRS: TRACE-GAP — requested by product owner on 2026-11-13, hostname and DNS control pending
- Design/mockup: TBD
- PR: -

**Story**
As a visitor, I want to access BoscoChat using its official domain securely and consistently.

**Acceptance criteria**
- [ ] Confirm exact official domain, DNS registrar, authorized DNS administration and intended app/API subdomains.
- [ ] Configure custom domain on AWS Amplify; attach and validate TLS certificate, force HTTPS and verify DNS resolution.
- [ ] Place the API on a suitable HTTPS subdomain with a valid certificate and update frontend API base, backend CORS and cookie domain/SameSite settings safely.
- [ ] Verify registration, login, session persistence, public search and protected PDF viewer from the final domain, including mobile browsers.
- [ ] Preserve existing links or document redirects; provide rollback and document DNS changes without committing credentials.

### BC-017 — Gestión histórica: private archive management
- Priority: P1
- Status: DONE
- Owner role: Product / Developer
- Depends on: BC-002, BC-006, BC-007
- SRS: RF-DOCMGMT-01, RF-DOCMGMT-02, RF-DOCMGMT-04; TRACE-GAP for exact upload/download authorization policy
- Design/mockup: TBD
- PR: #41 (in review; flags default off)

**Story**
As an authorized archive administrator or documentary manager, I want to upload files, list available documents, filter by filename and download original files from an authenticated website area.

**Acceptance criteria**
- [x] Provide a protected archive-management route in the React web application, restricted server-side to the historian (`documentary_manager`) role.
- [ ] List existing objects under private S3 originals/ with filename, size, year, ingestion status and pagination; exclude folder markers.
- [x] Support case-insensitive filename filtering and safe handling of Unicode, special characters and missing metadata.
- [ ] Upload PDF files using a private short-lived upload mechanism or streaming proxy with content-type/size validation, overwrite policy, checksum and failure states.
- [ ] Successful upload triggers the automatic ingestion pipeline; show pending/processed/failed state and retry for authorized managers.
- [x] Authorize original-PDF downloads via a controlled private mechanism; never expose a public bucket.
- [ ] Audit operations, prevent IDOR/path traversal, enforce limits and test permissions, failures and concurrency.
- [ ] Enable administrator/historian deletion of original PDFs and their indexed data with explicit confirmation, and manual indexing of eligible nonindexed PDFs; finish staging race testing, IAM and independent review.
- [ ] Offer Indexar/Desindexar depending on the document's actual indexed status; desindexing retains the S3 original and clears only searchable MySQL document/pages, with race guard and audit.
- [x] Separate public search, authenticated reading and privileged upload/download access.

**Implementation/release evidence (2026-11-13)**
- Owner-approved label: **Gestión histórica**. PR #41 adds protected React area, S3 annual inventory, case-insensitive filename filter, MySQL indexing status, conditional signed PUT for uploads (with `If-None-Match: *` preventing overwrites), and signed original download.
- Restricted to administrator/documentary_manager at backend. Frontend and backend feature flags remain OFF until security review and AWS IAM/CORS/real-archive tests pass.
- Pending: full metadata schema for other publications, checksum/antimalware, documented upload audit trail, pagination UX, retry/failure tracking, independent FULL security review, SRS baseline reconciliation and approved admin download policy. Dependencies are not yet all DONE. Do not mark story DONE.

**Aceptación funcional del responsable (2026-11-19).** Se acepta Gestión histórica y sus operaciones ordinarias (subida, indexación, desindexación, eliminación); faltan verificaciones adversarias y de fallos parciales S3/MySQL. Evidencias no existentes no se dan por superadas; se trasladan al seguimiento BC-018.

### BC-014 — User profile management
- Priority: P2
- Status: IDEA
- Owner role: Product / Developer
- Depends on: BC-001
- SRS: TRACE-GAP — proposed backlog scope; explicit product-owner and SRS-baseline approval pending
- Design/mockup: TBD
- PR: -

**Story**  
As an authenticated user, I want to view and maintain my own profile so that my account information remains accurate.

**Acceptance criteria**
- [ ] The authenticated user can view their username, email, role, subscription and email-verification status without password hashes, tokens or internal security data.
- [ ] Only the username is editable in this story; email change is handled exclusively by BC-015.
- [ ] Username updates use the same validation limits as registration and reject invalid values with safe, consistent errors.
- [ ] Backend authorization prevents reading or modifying another user's profile.
- [ ] Automated tests cover profile retrieval, successful username update, validation failure and cross-account denial.
- [ ] Before READY: add the requirement to the approved SRS baseline and approve privacy/audit requirements.

### BC-015 — Email verification and controlled email change
- Priority: P1
- Status: IDEA
- Owner role: Product / Developer
- Depends on: BC-001
- SRS: TRACE-GAP — proposed backlog scope; explicit product-owner and SRS-baseline approval pending
- Design/mockup: TBD
- PR: -

**Story**  
As an account holder, I want to verify my email address and securely confirm email changes so that BoscoChat can trust the account contact address.

**Acceptance criteria**
- [ ] Verification tokens are cryptographically random, stored only as digests, single-use and expire no later than 24 hours after issuance.
- [ ] Verification and resend endpoints use generic responses, enforce rate limits and never log token values.
- [ ] Registration records verification status and sends a verification message through an approved provider and sender domain.
- [ ] Email change requires an authenticated session and confirmation of the new unique address; the previous address remains active until confirmation.
- [ ] Automated tests cover valid confirmation, expiry, reuse, invalid token, resend throttling, duplicate address and controlled email change.
- [ ] Before READY: approve provider, sender domain, resend limits, unverified-account access policy, retention/privacy controls and add the requirement to the approved SRS baseline.

---

### BC-018 — Independent documentary MVP assurance and SRS reconciliation
- Priority: P1
- Status: READY
- Owner role: Verifier / Cybersecurity / Product
- Depends on: -
- SRS: RF-SEARCH-01..12, RF-DOC-01..04, RF-DOCMGMT-01..04, RF-USER-03, RNF-SEC-02, RNF-PERF-01
- Design/mockup: -
- PR: -

**Story**
As the platform, I want independently documented verification of the user-accepted documentary MVP, without reopening accepted workflows.

**Acceptance criteria**
- [ ] Distinct reviewer validates permissions and negative API cases for anonymous, free, historian and administrator sessions.
- [ ] E2E using synthetic PDFs covers upload, indexing, search/pagination, page viewer, unindex, reindex and deletion, including concurrency and failures.
- [ ] Independently check SRS features: exact phrases and AND/OR, publication/issue/date/author/section filters, snippets/highlights, complete metadata and viewer zoom/scroll/page positioning; create targeted issues for proven omissions.
- [ ] Security tests include controlled PDF access, invisible watermark requirement, rate limits, audit and storage retention.
- [ ] Product approves SRS baseline amendment for public anonymous discovery vs RF-USER-03 and maintains source-page authentication.
- [ ] Document performance benchmarks, GDPR/privacy and independent FULL cybersecurity review.

**Context:** BC-008/010/011/012/017 are DONE on explicit owner functional acceptance 2026-11-19. This story retains unresolved independent verification and compliance evidence; DONE does not claim that missing tests were executed.

---

# Phase 2 — Conversational AI / RAG

### BC-101 — Conversational interface and history
- Priority: P1
- Status: IN_REVIEW
- Owner role: Developer
- Depends on: BC-001, BC-008, BC-012
- SRS: RF-CHAT-01, RF-CHAT-02, RF-CHAT-03, RF-CHAT-06, RNF-USE-02
- Design/mockup: Admin-only conversational UI
- PR: #67 (merged; administrator-only pilot) / #68 (long-question fix, merged)

**Story**
An administrator can chat with the historical corpus through Amazon Bedrock; nobody else can see or invoke the feature.

**Acceptance criteria**
- [x] Navigation visible exclusively to administrator, including after refresh and sign-in. No entry or teaser for free, historian or paid-role accounts.
- [x] Server-side auth from verified session: unauthenticated 401; all non-administrator roles 403 even when endpoint called directly. Include negative tests.
- [x] Enable only by explicit backend and frontend flags, both disabled by default; denial cannot be bypassed by editing the client.
- [x] Conversational React interface includes multi-turn context, reset, bounded prompt/history, loading and error states; no user-to-user conversation leakage.
- [x] Bedrock invocation only server-side with least-privilege IAM, fixed bounded maxTokens, input and cost throttles, safe logs, GDPR limits, and graceful model failures.
- [ ] No automatic grants to paid users until subscription/payment verification and plan-specific limits are designed.
- [ ] Independent security approval and administrator E2E required before release.

**Selected design:** Amazon Bedrock server-side Converse; initial model candidate amazon.nova-pro-v1:0, confirmed available on-demand in us-east-1 on 2026-11-19. Region and model configurable; verify data locality and pricing before deployment.

**Pilot rollout (2026-11-19):** AWS IAM and isolated inference Lambda deployed; flags enabled only for administrators; CI and synthetic model/worker smoke tests passed. Pending **independent** security/GDPR review and administrator-session E2E before DONE or extending access. See docs/deployment/BC-101_ADMIN_CHAT_ROLLOUT.md.

### BC-102 — Semantic retrieval and RAG generation
- Priority: P1
- Status: IN_REVIEW
- Owner role: Developer
- Depends on: BC-101, BC-007
- SRS: RF-RAG-01, RF-RAG-02, RF-RAG-05, RNF-PERF-02
- Design/mockup: Retrieval-augmented generation over existing indexed pages
- PR: #67 (merged) / #68 (merged)

**Story**
Ground chat answers in MySQL archive data, not unsupported model recollection.

**Acceptance criteria**
- [x] Backend performs read-only parameterized MySQL FULLTEXT retrieval over indexed documents/pages; no LLM-generated SQL or database write privileges.
- [x] Ranked bounded OCR excerpts with document ID, publication/year and page are passed as untrusted quoted context to Bedrock.
- [x] Instruct model to respond in Spanish, distinguish uncertain answers, resist prompt injection in OCR and avoid fabricated evidence.
- [x] Prevent access to deleted/unindexed originals and private S3 keys. Keep maxTokens explicit, input bounded and cost/latency observed.
- [ ] E2E and adversarial tests for empty, noisy and malicious documents.
- [ ] Optional vector/semantic retrieval is a later improvement after cost/quality assessment; do not provision a second corpus index by default.

**Pilot rollout (2026-11-19):** SQL-only retrieval plus isolated Bedrock worker active for administrators; long Spanish questions handled by bounded extraction. Independent grounding/citations, performance, GDPR and adversarial review remain open before DONE.

### BC-103 — Documentary citations and source-page navigation
- Priority: P1
- Status: IDEA
- Owner role: Developer
- Depends on: BC-102, BC-012
- SRS: RF-RAG-03, RF-RAG-04, RF-CHAT-07
- Design/mockup: Grounded citations and protected viewer links
- PR: -

**Acceptance criteria**
- [ ] All documentary claims cite verified retrieved passages with source PDF and page, never a model-invented identifier.
- [ ] Citation opens the existing authorized page viewer at the correct page.
- [ ] If evidence is missing, state it clearly; do not fabricate a citation.

### BC-104 — Conversational quotas
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: BC-003, BC-101, BC-004, BC-005
- SRS: RF-CHAT-04, RF-CHAT-05
- Design/mockup: Future plan quotas
- PR: -

**Acceptance criteria**
- [ ] During administrator-only beta, track usage and cap spend without any paid access.
- [ ] After verified subscription/payment support, enforce server-side plan eligibility and per-plan chat quotas and test abuse/expiry.
- [ ] Neither non-admins nor historians gain access until an explicitly authorized future rollout.

---

# Phase 3 — Visual analysis and historical entities

### BC-201 — Image extraction during ingestion
- Priority: P3
- Status: IDEA
- Owner role: Developer
- Depends on: BC-007
- SRS: RF-DOCMGMT-03
- Design/mockup: TBD
- PR: -

### BC-202 — Historical person and location entities
- Priority: P3
- Status: IDEA
- Owner role: Developer
- Depends on: BC-002
- SRS: RF-ENTITY-01, RF-ENTITY-02
- Design/mockup: TBD
- PR: -

### BC-203 — Face detection and similarity grouping
- Priority: P3
- Status: IDEA
- Owner role: Developer
- Depends on: BC-201, BC-202
- SRS: RF-AI-01, RF-AI-03, RNF-DATA-02
- Design/mockup: TBD
- PR: -

### BC-204 — Human validation of AI person associations
- Priority: P3
- Status: IDEA
- Owner role: Developer
- Depends on: BC-203
- SRS: RF-AI-02, RF-AI-04, RNF-DATA-02
- Design/mockup: TBD
- PR: -

**Security / privacy considerations for Phase 3**
- Facial/person analysis can involve biometric/personal data and requires a dedicated privacy/legal gate before implementation or production use.
- Human supervision/validation is mandatory per the SRS.

---

# Cross-cutting non-functional requirements

Every applicable story must preserve these constraints:

- RNF-PERF-03 — initial web load target < 2 seconds under normal conditions.
- RNF-SCALE-01 — design initially for 50 concurrent users and permit growth to 1,000-2,000.
- RNF-SCALE-02 — corpus extensibility without fundamental redesign.
- RNF-AVAIL-01 — minimum 90% normal-period availability.
- RNF-AVAIL-02 — minimize maintenance impact.
- RNF-DATA-01 — GDPR compliance for personal data.
- RNF-USE-01 — intuitive interface for non-technical users.
- RNF-MAINT-01 / RNF-MAINT-02 — modular and extensible architecture.

## Automation rule

`READY` is a refinement state, not automatic execution authority. Automated development may select a story only when it is `READY`, every dependency is `DONE`, no active branch/PR already implements it, and no documented gate blocks it. Product scope outside the SRS must remain `IDEA` with `TRACE-GAP` until product review and SRS-baseline approval.


