# BoscoChat Decisions

Record material product/architecture/security/privacy decisions here.

## ADR-lite template
### DEC-XXX — Title
- Date: YYYY-MM-DD
- Status: proposed | accepted | superseded
- Context: ...
- Decision: ...
- Consequences: ...
- Related stories/PRs: ...

### DEC-001 — Opaque server-side sessions and scrypt password storage
- Date: 2026-09-14
- Status: accepted
- Context: BC-001 requires secure registration/login and server-enforced sessions. The initial Node.js/Express/MySQL prototype compared plaintext passwords and returned database rows directly.
- Decision: Hash passwords with Node.js `scrypt` using a random per-password salt. Authenticate browsers with random opaque tokens delivered only in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); persist only token digests and expiry in MySQL. Limit repeated login attempts through fixed-window counters shared in MySQL across Lambda instances, identify buckets only with HMAC-SHA-256 pseudonyms derived from a deployment secret, and require exact configured browser origins. Migrate legacy plaintext credentials to hashes before removing the plaintext column.
- Consequences: Session revocation is immediate and authorization remains server-controlled. Production authentication now fails closed unless a shared limiter and an `AUTH_RATE_LIMIT_HMAC_KEY` of at least 32 bytes are configured. The MySQL migration and cross-instance behavior require representative concurrency validation; route-specific API Gateway/WAF throttling remains defense in depth. Operations must back up the user table and rotate the previously exposed database credential before deployment.
- Related stories/PRs: BC-001; PR #4.

### DEC-002 — Amplify + API Gateway + Lambda Web Adapter + private RDS for the MVP
- Date: 2026-09-15
- Status: accepted
- Context: BoscoChat needs a low-cost AWS runtime for the existing React/Vite frontend and Express/MySQL authentication stack. AWS App Runner was not available for new customers, and rewriting the Express API as individual Lambda handlers would duplicate authentication logic. The frontend and default API Gateway hostname are on different sites, so credentialed browser sessions require an explicit cross-site cookie/CORS configuration.
- Decision: Host the frontend in AWS Amplify, expose the API through API Gateway HTTP API, run the existing Express server in AWS Lambda using AWS Lambda Web Adapter, and keep MySQL in a private RDS instance. Lambda is attached to the RDS VPC with a dedicated security group and uses a small MySQL pool. RDS connections use verified TLS with `DB_SSL_MODE=require`; the current runtime supplies the matching `rds-ca-rsa2048-g1` root CA through `DB_SSL_CA_BASE64`. Browser authentication uses the existing opaque server-side session with `HttpOnly; Secure; SameSite=None`, exact-origin CORS and `credentials: include`. Database credentials remain backend-only Lambda runtime configuration for the MVP; Secrets Manager is optional hardening rather than an initial dependency.
- Consequences: The existing API is reused without a handler rewrite and the initial hosting cost remains low. Lambda concurrency and per-environment connection pools must be capped/observed to protect RDS. The default Amplify/API Gateway domains create a third-party-cookie dependency in some browser/privacy configurations; custom same-site subdomains are preferred before broader production use. The private Lambda runtime has no implicit Internet egress, so later outbound integrations may require a deliberate egress design. Schema migrations need a trusted execution path with private RDS connectivity; manual DDL is not the preferred repeatable deployment mechanism.
- Related stories/PRs: BC-001; PR #7.

### DEC-003 — Configurable fixed-window query quotas with atomic persistence
- Date: 2026-09-15
- Status: accepted
- Context: BC-003 requires separate search/chat accounting, configurable per-plan periodic limits, complete query records and safe enforcement under concurrent requests. Product quota values and reset periods are deployment policy rather than approved constants in the SRS.
- Decision: Validate per-plan/type limits from `QUERY_QUOTAS_JSON`, fail closed for missing plan/type configuration, and enforce fixed windows with transactionally locked MySQL counters. Record accepted and quota-blocked authenticated requests in `query_logs` with bounded JSON parameters. Return rate-limit metadata and a consistent HTTP 429 upgrade response when exhausted.
- Consequences: Deployments must provide approved quota values for every enabled role/plan. Atomic counters prevent concurrent over-consumption; fixed windows are deliberately simple and may later be replaced behind `UsageService`. Query logs are user-linked personal/operational data, inaccessible through public routes and cascade-deleted with the user; production retention remains an explicit privacy/deployment policy.
- Related stories/PRs: BC-003; PR #10.

### DEC-004 — Canonical roles and centralized backend authorization
- Date: 2026-10-30
- Status: accepted
- Context: BC-002 requires six user roles and administrator-controlled account lifecycle operations. The legacy MVP used `admin` / `gestor` strings and duplicated cookie/role checks inside individual routes, which risked inconsistent authorization and unsafe role updates.
- Decision: Store the six canonical role identifiers defined by RF-USER-04, normalize legacy aliases during migration, and centralize session resolution plus role allowlists in backend middleware. Expose account administration through `/api/admin/users`, restricted to `administrator`; suspension revokes sessions, and self-demotion/self-suspension/self-deletion are rejected. Keep the legacy role-update endpoint only as a compatibility alias delegating to the same validated service.
- Consequences: Role changes are effective on the next authenticated request because sessions resolve the current database user. Documentary-manager permission remains distinct from paid tiers. Deployments must run the migration before using the new API, and independent authorization/security review remains mandatory before completion.
- Related stories/PRs: BC-002; PR #13.


### DEC-005 — Event-driven private S3 PDF ingestion (proposed)
- Date: 2026-11-13
- Status: proposed
- Context: The owner has 92 annual PDFs already in S3 and requires every future uploaded PDF to be indexed without manually running scripts or keeping CloudShell active. RDS is private; the public API Lambda should not perform multi-minute PDF extraction.
- Decision: Use S3 EventBridge Object Created notifications -> EventBridge rule -> SQS standard queue with dead-letter queue -> dedicated VPC Lambda container (Node.js 22 and Poppler) -> MySQL FULLTEXT index. Limit processing concurrency and one PDF per SQS message; use atomic page replacement keyed by the private S3 object key. Keep OCR improvement as a separate future pipeline.
- Consequences: S3 EventBridge must be explicitly enabled on the existing bucket; deploying the CloudFormation stack alone does not start event delivery. Historical PDFs require a deliberate one-time backfill; SQS is at-least-once, so workers must handle duplicate messages and failures safely. Requires CI, independent verification/security, operational alarms, ECR image publishing, cost/load tests, least-privilege IAM and secret-lifecycle handling before production use.
- Related stories/PRs: BC-007; PR #25 (implementation proposal).


### DEC-006 — Consejo multiagente con consenso fundamentado, no por mayoría
- Date: 2026-11-20
- Status: proposed
- Context: BC-107 amplía tanto el chat de investigación como la futura catalogación TIFF/PDF para incorporar especialistas, contradicción y revisión de evidencia.
- Decision: Mantener un motor propio simple y reutilizable de propuestas JSON acotadas, ejecución paralela de dos roles, crítica posterior y resolución determinista sobre referencias de fuente autorizadas. Las afirmaciones consensuadas deben además corresponder literalmente a algún extracto OCR citado; una cita OCR existente aún no verifica por sí sola la interpretación histórica. Las discrepancias requieren revisión o respuestas inciertas; ningún resultado de IA puede publicar originales, modificar índice o asignar identidades por sí solo. Usar el worker aislado Bedrock existente para piloto opcional de chat (sin DB/S3 en el modelo), no crear de momento Bedrock Agents Classic o nuevas infraestructuras. Respetar el modo de chat antiguo cuando la bandera está desactivada.
- Consequences: El modo Investigación multiagente puede llamar cuatro veces al modelo (dos en paralelo más crítica y síntesis), elevando coste y latencia. `BOSCOCHAT_COUNCIL_CHAT_ENABLED` apagada hasta completar límites de AWS, verificación de calidad y p95 frente al timeout actual de 22 segundos; permisos y cuotas compartidos. Las tareas documentales futuras serán asíncronas y la publicación exigirá aprobación de historiador.
- Related stories/PRs: BC-107 #84 / PR #85; BC-105 #80; BC-106 #82; BC-201 #83.

