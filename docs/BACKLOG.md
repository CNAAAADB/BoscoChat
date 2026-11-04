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
- PR: #13 (merged 2026-11-02; delivery gate remains BLOCKED)

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
- [ ] Representative MySQL migration/concurrency validation.
- [ ] Approve access, retention and deletion policy for personal identifiers in `admin_audit_logs`.
- HIGH `SEC-BC002-03 / CWE-400`: rotating email values bypassed the `IP|email` authentication limiter and could force unbounded password-hash work from one source IP. PR #17 contains an aggregate-IP remediation and regression test. Build/test/package CI passed on exact SHA `e105577`; the finding remains open until a distinct independent FULL security review verifies that remediation.
- A merged PR does not satisfy these gates; BC-002 remains `BLOCKED`.

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
- PR: #14 (merged 2026-11-02; test tooling/proposal only)

**Story**  
As the platform, I want a structured documentary data model and protected document storage so that historical publications can be ingested and served securely.

**Acceptance criteria**
- [ ] Model at least Publication, Publication issue, Page, Text fragment, User, Subscription and Query log as required for MVP.
- [ ] Store document references/metadata required by the SRS.
- [ ] Original documents are not publicly/directly accessible.
- [ ] Backend authorizes access before serving document content.
- [ ] Architecture supports adding new publications without redesigning the core data model.

**Gate status**
- PR #14 added owner-authorized private test-corpus tooling and a proposed S3/SSE-KMS/IAM/backend-authorized-access architecture.
- PR #17 retrieved the three owner-authorized originals without persisting or publishing them and verified the received bytes twice in CI. Recorded SHA-256 values are: issue 766 `bd3fb59f977e33ee1291f651393bcb07d8588408680bd9db03e19dbc8bc43b2f` (2,399,080 bytes), issue 767 `d054fba67c81e1c00e5dabfd4c78990e0de02b2ce145b8a002c53335fcdcd62f` (2,269,063 bytes), and issue 768 `a55356d0b23bba4be681877942a4e9db764418dd1f2661c2327210900fea8b8f` (3,003,344 bytes).
- PR #17 adds the bounded non-persistent source-hash verifier and adopts S3 private, SSE-KMS, backend proxy and separated minimum-privilege roles as proposed defaults. Corpus CI passed on exact SHA `e105577`; distinct independent review is still pending.
- No S3 bucket, KMS key, IAM policy, backend document-access integration, IaC or representative AWS verification exists.
- Cloud/privacy decisions and independent FULL review remain pending. BC-006 stays `BLOCKED`; PR #14 does not implement BC-006, BC-007 or BC-008.

### BC-007 — Document upload and ingestion pipeline
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-002, BC-006
- SRS: RF-DOCMGMT-01, RF-DOCMGMT-02, RF-DOCMGMT-04
- Design/mockup: TBD
- PR: -

**Story**  
As a Documentary manager, I want to upload historical publication PDFs and ingest their OCR content so that they become searchable.

**Acceptance criteria**
- [ ] Only Documentary manager or Administrator can upload documents.
- [ ] Upload captures publication, issue/volume, date and optional author/section metadata.
- [ ] Ingestion stores the PDF, creates page representations, imports/extracts OCR, chunks text and indexes fragments.
- [ ] Documentary manager can correct page OCR.
- [ ] OCR corrections retain an audit trail and update affected search data.
- [ ] Failed ingestion leaves a diagnosable/retryable state rather than silently succeeding.

### BC-008 — Keyword, phrase and logical search
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-007
- SRS: RF-SEARCH-01, RF-SEARCH-02, RF-SEARCH-03, RF-SEARCH-04, RNF-PERF-01
- Design/mockup: TBD
- PR: -

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

### BC-009 — Preserve query through authentication
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-001, BC-008
- SRS: RF-USER-03
- Design/mockup: TBD
- PR: -

**Story**  
As an unauthenticated visitor, I want my entered search retained while I log in/register so that it executes after successful authentication.

**Acceptance criteria**
- [ ] Search execution is blocked before authentication.
- [ ] Login and registration choices are presented.
- [ ] Entered query is retained temporarily.
- [ ] Query executes automatically after successful authentication.
- [ ] Temporary query data is not retained longer than necessary.

### BC-010 — Documentary search filters
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-008
- SRS: RF-SEARCH-05, RF-SEARCH-06, RF-SEARCH-07, RF-SEARCH-08, RF-SEARCH-09
- Design/mockup: TBD
- PR: -

**Story**  
As a registered user, I want to filter search results by documentary metadata so that I can narrow the corpus efficiently.

**Acceptance criteria**
- [ ] Filter by one or more publications.
- [ ] Filter by publication issue/number.
- [ ] Filter by date range.
- [ ] Filter by author when metadata exists.
- [ ] Filter by editorial section when metadata exists.
- [ ] Filters combine correctly with search syntax.

### BC-011 — Search result presentation
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-008, BC-010
- SRS: RF-SEARCH-10, RF-SEARCH-11, RF-SEARCH-12, RNF-USE-02
- Design/mockup: TBD
- PR: -

**Story**  
As a registered user, I want search results to show highlighted fragments and source metadata so that I can evaluate relevance and open the original source.

**Acceptance criteria**
- [ ] Show matching OCR fragment.
- [ ] Visually highlight matching terms/phrases.
- [ ] Show publication, issue number, publication date and page number.
- [ ] Provide an action to open the original in the integrated viewer.
- [ ] Presentation is clear and understandable.

### BC-012 — Protected integrated PDF viewer
- Priority: P1
- Status: READY
- Owner role: Developer
- Depends on: BC-006, BC-011
- SRS: RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04, RNF-SEC-02
- Design/mockup: TBD
- PR: -

**Story**  
As a registered user, I want to view original documents inside BoscoChat on the relevant page without receiving a direct downloadable document URL.

**Acceptance criteria**
- [ ] Integrated viewer supports page navigation, zoom and page scrolling.
- [ ] Opening from a search result positions the viewer on the relevant page.
- [ ] Direct external/public document access is denied.
- [ ] Backend verifies authorization before serving content.
- [ ] Viewer does not expose a direct download action.
- [ ] Invisible user-associated watermarking required by RF-DOC-03 is implemented and verified.

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

---

# Phase 2 — Conversational AI / RAG

### BC-101 — Conversational interface and history
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: Phase 1 MVP
- SRS: RF-CHAT-01, RF-CHAT-02, RF-CHAT-03, RF-CHAT-06, RNF-USE-02
- Design/mockup: TBD
- PR: -

### BC-102 — Semantic retrieval and RAG generation
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: BC-101, BC-007
- SRS: RF-RAG-01, RF-RAG-02, RF-RAG-05, RNF-PERF-02
- Design/mockup: TBD
- PR: -

### BC-103 — Documentary citations and source-page navigation
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: BC-102, BC-012
- SRS: RF-RAG-03, RF-RAG-04, RF-CHAT-07
- Design/mockup: TBD
- PR: -

### BC-104 — Conversational quotas
- Priority: P2
- Status: IDEA
- Owner role: Developer
- Depends on: BC-003, BC-101
- SRS: RF-CHAT-04, RF-CHAT-05
- Design/mockup: TBD
- PR: -

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


