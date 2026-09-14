# BoscoChat Architecture

## Sources

- Product/technical baseline: `docs/requirements/SRS_BoscoChat.md`
- Repository-specific implementation facts: this document and `ai/project-profile.md`

The SRS defines the target architecture and behavior. Concrete technology/service choices are implementation decisions unless the SRS explicitly fixes them.

## Current repository layout

- `backend/`: Node.js + Express API with MySQL access.
- `frontend/`: React + Vite web client.

## Product architecture baseline

BoscoChat is a modular web platform with these logical layers/components:

1. **Web client** — authentication, documentary search, result presentation, integrated document viewing, later conversational UI and corpus administration.
2. **Application backend/API** — authentication/authorization, roles, quotas, subscriptions, search orchestration, document access, corpus management and external-service integration.
3. **Documentary retrieval** — OCR text ingestion, chunking, textual indexing and keyword/phrase/operator search.
4. **Semantic retrieval** — vector representations and similarity retrieval for Phase 2 RAG.
5. **Answer generation / RAG** — retrieval-grounded conversational answers with documentary citations.
6. **Document processing** — PDF ingestion, page representations, OCR import/extraction, chunking/indexing and later image extraction.
7. **Image analysis** — Phase 3 face detection, similarity/grouping and human-reviewed identity suggestions.
8. **Storage** — structured database, protected document/object storage, OCR/chunks/indexes, vector data, images and operational logs.
9. **Subscriptions/payments** — plan management and external payment events; the SRS diagram names Stripe.
10. **Monitoring** — usage, latency, server/resource consumption and operational health.

## Data model baseline

The SRS defines these domain entities:

- Publication
- Publication issue/number
- Page
- Text fragment/chunk
- Image
- Person
- Person appearance
- Location
- User
- Subscription
- Query log

MVP implementation may introduce supporting technical entities, but changes must preserve traceability to this domain model.

## Target infrastructure

AWS is the target hosting environment. The SRS requires a modular cloud infrastructure containing conceptually:

- application compute;
- primary relational/structured database;
- private object/document storage for PDFs and images;
- documentary text indexing/search;
- vector storage/retrieval for Phase 2;
- external AI services for embeddings/generation and later image processing;
- monitoring/observability.

Exact AWS services, network boundaries, identity model, IaC, deployment topology, backup/recovery and observability choices must be captured as architecture decisions before or during implementation.

## Security and privacy boundaries

- No anonymous execution of documentary search or conversational queries.
- Enforce authorization server-side for all protected operations.
- Original documents must not be directly internet-accessible; access is mediated by the backend.
- The integrated viewer must not expose a direct download flow and must implement the SRS watermark requirement for viewed documents.
- Store passwords only using an appropriate password-hashing mechanism.
- Validate untrusted input at trust boundaries and use parameterized database access.
- Keep secrets and provider credentials out of source control.
- Personal data processing is subject to GDPR/privacy-by-design requirements.
- Phase 3 face/person analysis requires a dedicated biometric-data privacy/legal review and mandatory human validation.

## Implemented authentication boundary (BC-001)

- The Express API owns registration, credential verification, session creation, session lookup and logout (`RF-USER-01`, `RF-USER-02`, `RNF-SEC-01`, `RNF-SEC-03`).
- Passwords are stored as per-user salted `scrypt` hashes. Passwords and hashes are never returned by the API.
- Browser authentication uses a 256-bit opaque token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only the SHA-256 digest of the token is persisted in MySQL, with an eight-hour expiry.
- Protected legacy routes resolve the current user from the server-side session; caller-supplied user IDs are not trusted for identity.
- Login attempts are limited per source/email key. This limiter is process-local for the current single-instance MVP; a shared limiter is required before horizontal API scaling.
- Database credentials are runtime configuration only. Exact allowed browser origins are configured with `CORS_ORIGINS`, and cross-origin state-changing requests from other origins are rejected.
- The authentication migration creates the canonical user/session schema, hashes legacy plaintext passwords and removes the plaintext column. Deployment requires a verified backup and rotation of the credential formerly present in repository history.

## Performance/scalability targets from the SRS

- Indexed documentary search: target < 2 seconds.
- Conversational response (Phase 2): target < 12 seconds.
- Initial web load: target < 2 seconds under normal network conditions.
- Initial concurrency: up to 50 users.
- Evolution target: 1,000-2,000 concurrent users.
- Availability: minimum 90% during normal operational periods.
- Corpus must be extensible without fundamental data-model/storage redesign.

## Architectural rules

- Keep frontend, backend, persistence, search, AI and external-provider boundaries explicit.
- Prefer replaceable adapters for payment and AI providers.
- Do not introduce Phase 2/3 infrastructure into MVP without a concrete need or approved architectural decision.
- Update this document and `docs/DECISIONS.md` for material architecture changes.
- Trace architecture-impacting PRs back to `RF-*`/`RNF-*` IDs and `BC-*` stories.
