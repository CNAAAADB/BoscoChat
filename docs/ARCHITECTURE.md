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

## AWS deployment baseline for the MVP

The current hosting choice is AWS Amplify Hosting for the React/Vite frontend. The MVP trust path is:

`Browser -> Amplify Hosting -> API Gateway HTTP API -> AWS Lambda (Express) -> private Amazon RDS for MySQL`

The browser never connects directly to the database. Lambda is the only application runtime allowed to use the application database credential.

The existing Express application is reused in Lambda through AWS Lambda Web Adapter rather than maintaining a second set of handlers. Lambda is attached to the RDS VPC and uses a dedicated runtime security group. RDS must remain non-public and permits TCP/3306 only from explicitly approved security groups.

For the initial low-traffic MVP, database connection pools are intentionally small because each Lambda execution environment can own a separate pool. Reserved Lambda concurrency should also be capped until RDS connection pressure is measured.

The application DB credential is runtime-only. The human/master copy may be kept in the project owner's password manager; Lambda receives the runtime value as an encrypted-at-rest environment variable for the MVP. It must never be committed to Git, exposed via Amplify/Vite, returned to the browser, or logged. Secrets Manager remains an optional later hardening step rather than an MVP dependency.

### Validated AWS runtime — 2026-09-15

The authentication path introduced by PR #7 has been provisioned and validated end-to-end in `us-east-1`:

- Amplify production origin: `https://main.dyqpe5eifx600.amplifyapp.com`.
- API Gateway HTTP API base URL: `https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com`.
- API Gateway routing: `$default` stage with automatic deployment and `ANY /{proxy+}` forwarding to Lambda.
- Lambda function: `boscochat-backend`, Node.js 22.x, x86_64, running the Express server through AWS Lambda Web Adapter.
- VPC: `vpc-02f28e9c3d2d0eab2`.
- Lambda security group: `boscochat-lambda-sg` (`sg-0c280487ace7bd7b5`).
- RDS instance: `boscochat-db`, private MySQL, application database `boscochat`.
- RDS endpoint: `boscochat-db.c8748aycc2rw.us-east-1.rds.amazonaws.com:3306`.
- RDS security group: `boscochat-rds-sg` (`sg-03cc39ee8b10af87a`), with MySQL access from the Lambda security group.
- Application DB user: `boscochat_app`; the application does not run as the RDS master user.
- RDS certificate authority: `rds-ca-rsa2048-g1`.
- Verified TLS requires `DB_SSL_MODE=require` and, in the deployed Lambda runtime, the matching RDS root CA supplied through `DB_SSL_CA_BASE64`.
- Browser CORS is exact-origin. `CORS_ORIGINS` must be `https://main.dyqpe5eifx600.amplifyapp.com` with no trailing slash.
- Cross-site browser sessions use `SESSION_COOKIE_SAME_SITE=none`, `NODE_ENV=production` and credentialed requests, producing `HttpOnly; Secure; SameSite=None` session cookies.
- Amplify uses `VITE_API_URL=https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api`.

Validated behavior includes `GET /health`, user registration, login, persisted `auth_sessions`, session restoration after browser reload, and logout/session invalidation. No database credential is exposed to Amplify or the browser.

Detailed deployment and verification instructions live in `docs/deployment/AWS_AMPLIFY_RDS.md`.

## Target infrastructure

AWS is the target hosting environment. The SRS requires a modular cloud infrastructure containing conceptually:

- application compute;
- primary relational/structured database;
- private object/document storage for PDFs and images;
- documentary text indexing/search;
- vector storage/retrieval for Phase 2;
- external AI services for embeddings/generation and later image processing;
- monitoring/observability.

Exact network IDs, regions, sizing, backup/recovery, IaC and observability details must be captured as they are provisioned.

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
- Browser authentication uses a 256-bit opaque token in an `HttpOnly` cookie. The default is `SameSite=Lax`; an Amplify frontend calling an API on a different site uses `SESSION_COOKIE_SAME_SITE=none`, which also forces the cookie to be `Secure`. Only the SHA-256 digest of the token is persisted in MySQL, with an eight-hour expiry.
- Protected legacy routes resolve the current user from the server-side session; caller-supplied user IDs are not trusted for identity.
- Login attempts are limited per source/email key. This limiter is process-local for the current MVP; Lambda can create multiple execution environments, so a shared limiter is required before relying on it as a fleet-wide control at higher scale.
- Database credentials are runtime configuration only. Production RDS connections use TLS (`DB_SSL_MODE=require`). Exact allowed browser origins are configured with `CORS_ORIGINS`, and cross-origin state-changing requests from other origins are rejected.
- The authentication migration creates the canonical user/session schema, hashes legacy plaintext passwords and removes the plaintext column. Deployment requires a verified backup and rotation of any credential formerly present in repository history.

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

## Query usage and quota boundary (BC-003)

- Authenticated search and chat requests pass through `UsageService` before query execution (`RF-USAGE-01`, `RF-USAGE-02`, `RF-USAGE-03`).
- Per-plan/type limit and fixed-window duration are validated runtime configuration (`QUERY_QUOTAS_JSON`); absent configuration fails closed rather than silently allowing unbounded use.
- `query_usage_counters` provides atomic MySQL counters locked within a transaction. `query_logs` records user, type, timestamp, bounded JSON parameters and accepted/blocked outcome. Search and chat counters remain independent.
- Quota responses expose limit, remaining units and reset time through rate-limit headers. Exhausted requests return HTTP 429 with a safe upgrade message.
- Query logs are personal/operational data: they are not publicly exposed and foreign-key deletion follows account deletion. A production retention schedule remains a deployment/privacy policy responsibility.

## Role and account-administration boundary (BC-002)

- BoscoChat uses six canonical roles: `free`, `pro`, `premium`, `advanced`, `administrator` and `documentary_manager` (`RF-USER-04`). Legacy `admin` and `gestor` values are accepted only at migration/authorization boundaries and are normalized in storage.
- Every protected request resolves the current user from the opaque server-side session. The backend middleware applies the role allowlist; client-supplied roles or user IDs never establish authority (`RNF-SEC-03`).
- Only `administrator` may list/create accounts, change roles, suspend/reactivate accounts or delete accounts (`RF-ADMIN-01`). `documentary_manager` has documentary-management permission but no account-administration permission; paid roles do not imply documentary or administrative privileges.
- Suspension sets `users.suspended_at`, revokes active sessions atomically and prevents new sessions until reactivation. User deletion relies on database foreign-key cascades for sessions and user-linked usage records.
- Self-demotion, self-suspension and self-deletion are rejected to preserve an active administrative control path. Password hashes and other authentication secrets are never returned by administration APIs.


## Planned automatic PDF ingestion (BC-007; not deployed)

The owner-approved operational flow is `S3 Object Created -> S3 EventBridge notifications -> EventBridge rule -> SQS + DLQ -> dedicated private VPC Lambda container with Poppler -> private MySQL RDS`. This worker is **independent of the public Express API Lambda**. It does not need inbound HTTP exposure, does not make the S3 bucket public, and keeps the original PDF as immutable storage input. A read-only IAM permission on `originals/*`, verified RDS TLS, strict parsing, size/page limits, SQS retries, and transactional page replacement are required. Multiple S3 events may be delivered; document keys are unique and updates replace indexed pages transactionally. EventBridge must be enabled explicitly on the bucket. This is proposed infrastructure only; the current deployment is not known to have it enabled.

New product requests BC-016 (official TLS domain for Amplify/API with same-site cookie/CORS validation) and BC-017 (role-protected S3 upload, list, name filter, original download and ingestion status) remain planned; public search/reader access and manager-only original file transfer remain separate security boundaries.

## Catálogo de revistas para BoscoGest

Con la búsqueda pública habilitada, `GET /api/archive/catalog?page=1` devuelve hasta 24 publicaciones indexadas con páginas, ordenadas por año, y `has_more`. La consulta comparte la base de datos y el límite de peticiones del archivo. Solo expone ID, publicación, año y primera página. BoscoGest consulta esos datos al abrir Revistas. El enlace `/#revista=ID&pagina=N` abre el lector de BoscoChat, que aplica la autenticación y los permisos habituales.
