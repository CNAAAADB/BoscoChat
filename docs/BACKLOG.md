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
- PR: #13

**Story**  
As the platform, I want role-based authorization so that users only access functions permitted for their role.

**Acceptance criteria**
- [x] Support Free, Pro, Premium, Advanced, Administrator and Documentary manager roles.
- [x] Authorization is enforced by the backend, not only by the UI.
- [x] Administrator can create accounts, modify roles, suspend accounts and delete accounts.
- [x] Unauthorized operations return safe, consistent errors.
- [x] Tests prove privilege boundaries for protected operations, including the concurrent last-active-administrator invariant.

**Blocking evidence (PR #13, SHA `a62f0dd`)**
- [ ] Independent functional verification on the exact reviewed SHA.
- [ ] Independent FULL authorization/security review.
- [x] GitHub Actions validates backend/frontend build, lint, tests and high-severity dependency audits on the exact SHA.
- [x] SEC-BC002-01 remediation implements a transactionally locked last-active-administrator invariant and concurrent regression test; independent FULL confirmation remains pending.
- [x] SEC-BC002-02 remediation adds security audit events for administrative success/denial; independent FULL confirmation remains pending.
- [ ] Representative MySQL migration/concurrency validation.
- [ ] Approve access, retention and deletion policy for the personal identifiers in `admin_audit_logs`.

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
- Design/mockup: TBD
- PR: -

**Story**  
As the platform, I want a structured documentary data model and protected document storage so that historical publications can be ingested and served securely.

**Acceptance criteria**
- [ ] Model at least Publication, Publication issue, Page, Text fragment, User, Subscription and Query log as required for MVP.
- [ ] Store document references/metadata required by the SRS.
- [ ] Original documents are not publicly/directly accessible.
- [ ] Backend authorizes access before serving document content.
- [ ] Architecture supports adding new publications without redesigning the core data model.

**Proposed storage architecture — DEC-005 (not implementation evidence)**
- Private AWS S3 bucket with Block Public Access and bucket-owner-enforced object ownership.
- Encryption at rest with a customer-managed AWS KMS key and TLS-only transport.
- Least-privilege IAM limited to the backend runtime and approved object prefixes/actions.
- Backend must authenticate and authorize each document request before streaming content or issuing a short-lived presigned URL; no stable public object URL.
- Before implementation: approve region/key ownership, retention/versioning, malware scanning, presigned-URL expiry and audit-log retention; then verify the exact deployment independently.

**Test-corpus provenance**
- The project owner stated on 2026-10-30 that they represent the Confederation and authorize using the identified *Don Bosco en España* issues for BoscoChat testing.
- This evidence covers project testing only; it does not establish permission for public redistribution or public hosting. PR #14 remains a draft test artifact and is not BC-006/007/008 implementation evidence.

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

### BC-014 — User profile management
- Priority: P2
- Status: IDEA
- Owner role: Product / Developer
- Depends on: BC-001
- SRS: TRACE-GAP — owner-directed addition on 2026-10-30; no baseline RF-/RNF-* identifier
- Design/mockup: TBD
- PR: -

**Scope evidence:** `TRACE-GAP` — currently supported only by an assertion in PR #15; explicit product-owner confirmation and SRS-baseline approval are required before refinement beyond IDEA.

**Story**  
As an authenticated user, I want to view and maintain my profile so that my account information remains accurate.

**Acceptance criteria**
- [ ] An authenticated user can view their own username, email, role/subscription and email-verification status without secrets or internal identifiers.
- [ ] The user can update only the approved editable fields; email change is handled exclusively by BC-015.
- [ ] Validation and uniqueness failures return safe, consistent errors.
- [ ] Backend authorization prevents reading or modifying another user's profile.
- [ ] Automated tests cover successful updates, validation failures and cross-account access denial.
- [ ] Before READY: approve editable fields, audit requirements, privacy impact and add the requirement to the SRS baseline.

### BC-015 — Email verification and controlled email change
- Priority: P1
- Status: IDEA
- Owner role: Product / Developer
- Depends on: BC-001
- SRS: TRACE-GAP — owner-directed addition on 2026-10-30; no baseline RF-/RNF-* identifier
- Design/mockup: TBD
- PR: -

**Scope evidence:** `TRACE-GAP` — currently supported only by an assertion in PR #15; explicit product-owner confirmation and SRS-baseline approval are required before refinement beyond IDEA.

**Story**  
As an account holder, I want to verify my email address and securely confirm email changes so that the platform can trust account contact addresses.

**Acceptance criteria**
- [ ] Verification tokens are cryptographically random, stored only as digests, single-use and expire within 24 hours.
- [ ] Verification and resend endpoints use generic responses, rate limits and do not expose token values in logs.
- [ ] A new registration records verification status and sends a verification message through an approved provider/sender domain.
- [ ] An email change requires an authenticated session and verification of the new unique address; the previous address remains active until confirmation.
- [ ] Automated tests cover expiry, reuse, invalid tokens, resend throttling, duplicate addresses and confirmation of a changed address.
- [ ] Before READY: approve provider, sender domain, resend limits, unverified-account access policy, retention and add the requirement to the SRS baseline.

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


