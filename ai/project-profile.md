# BoscoChat Project Profile

## Repository
- Repository: `CNAAAADB/BoscoChat`
- Default branch: `main`
- Delivery model: branch -> pull request -> CI/review -> merge

## Product stage
- Target: **Phase 1 MVP — Documentary search platform**.
- Requirements baseline: `docs/requirements/SRS_BoscoChat.md` (derived from the approved March 2026 BoscoChat SRS).
- Backlog source of truth: `docs/BACKLOG.md`.
- Preferred execution style: implement complete user stories with minimal human interruption; escalate only product, architecture, security/privacy or irreversible decisions that materially require human judgment.

## Roadmap

### Phase 1 / MVP
- User registration/authentication and roles
- Usage quotas and subscriptions
- Payment/subscription events
- Documentary corpus upload and ingestion
- OCR import/extraction, chunking and textual indexing
- Keyword, exact phrase and AND/OR search
- Publication/issue/date/author/section filters
- Fragment results with source metadata
- Protected integrated PDF viewer, source-page opening and download restriction

### Phase 2
- Conversational UI/history
- Semantic retrieval and vector storage
- RAG generation constrained to corpus content
- Documentary citations and source-page navigation
- Conversational quota accounting

### Phase 3
- Image extraction
- Person/location entities
- Face detection and similarity grouping
- Human-reviewed identity/context associations

## Current detected stack
### Backend
- JavaScript / Node.js
- ECMAScript modules
- Express 5
- MySQL via `mysql2`

### Frontend
- JavaScript / React 19
- Vite 8
- ESLint

### Infrastructure
- AWS is the target hosting environment.
- The SRS requires modular cloud compute, structured database, private document/object storage, search/indexing, later vector storage/AI/image processing and monitoring.
- Exact AWS services / IaC are architecture decisions and must be documented when introduced.

## SRS-driven non-functional targets
- Documentary search target < 2 seconds on indexed corpus.
- Phase 2 conversational response target < 12 seconds.
- Initial web load target < 2 seconds under normal network conditions.
- Initial scale up to 50 concurrent users; architecture should permit 1,000-2,000 later.
- Minimum normal-period availability: 90%.
- GDPR/privacy-by-design for personal data.
- Phase 3 biometric/person analysis requires dedicated privacy/legal review plus human supervision/validation.
- Original documents must not be directly public; backend authorization mediates access.

## Applicable cybersecurity skills today
Baseline:
- `security-code-review`
- `security-javascript-typescript`
- `security-express`
- `security-react`
- `security-web`
- `security-api`
- `security-database`
- `security-dependencies`
- `security-secrets`

Conditional:
- `security-auth` when auth/session/authorization is touched.
- `security-container` when Docker/container files exist or change.
- `security-iac` when IaC exists or changes.
- `security-cloud` for AWS configuration or cloud architecture.
- Payment/webhook security checks for subscription/payment changes.
- Dedicated privacy/biometric review before Phase 3 face/person functionality.

## Compliance / quality constraints
- GDPR/privacy by design for personal data.
- Secure coding and least privilege.
- No credentials or secrets committed to the repository.
- Findings are recorded with severity and confidence.
- CRITICAL/HIGH security findings block completion by default.
- Preserve SRS requirement identifiers (`RF-*`, `RNF-*`) in stories, tests and PR evidence.
- Missing requirement-to-story/code/test evidence is a `TRACE-GAP`.

## Automation policy
- Automated development may select only `READY` stories from `docs/BACKLOG.md`.
- Dependencies must be resolved and there must be no active branch/PR already implementing the same story.
- Do not invent new product scope from general knowledge; proposed scope outside the SRS/backlog must be returned to product/backlog review.
- Complete stories end-to-end with tests and PRs; do not stop after minimal scaffolding unless blocked by a real external decision/dependency.

## Role independence
The Developer/Implementer may create implementation and tests, but independent verification/security gates must not be self-approved by the same role when a dedicated reviewer role is available.

## Notes
The imported EN 50716 material is used as a governance/process reference. BoscoChat is not declared a railway safety project; therefore SSIL-specific requirements do not apply unless explicitly enabled by a future project decision.
