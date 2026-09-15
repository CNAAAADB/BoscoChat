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
- Decision: Hash passwords with Node.js `scrypt` using a random per-password salt. Authenticate browsers with random opaque tokens delivered only in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); persist only token digests and expiry in MySQL. Limit repeated login attempts and require exact configured browser origins. Migrate legacy plaintext credentials to hashes before removing the plaintext column.
- Consequences: Session revocation is immediate and authorization remains server-controlled. The process-local rate limiter is suitable only for the initial single-instance deployment and must move to a shared store before horizontal API scaling. Operations must back up the user table and rotate the previously exposed database credential before deployment.
- Related stories/PRs: BC-001; PR #4.

### DEC-002 — Amplify + API Gateway + Lambda Web Adapter + private RDS for the MVP
- Date: 2026-09-15
- Status: accepted
- Context: BoscoChat needs a low-cost AWS runtime for the existing React/Vite frontend and Express/MySQL authentication stack. AWS App Runner was not available for new customers, and rewriting the Express API as individual Lambda handlers would duplicate authentication logic. The frontend and default API Gateway hostname are on different sites, so credentialed browser sessions require an explicit cross-site cookie/CORS configuration.
- Decision: Host the frontend in AWS Amplify, expose the API through API Gateway HTTP API, run the existing Express server in AWS Lambda using AWS Lambda Web Adapter, and keep MySQL in a private RDS instance. Lambda is attached to the RDS VPC with a dedicated security group and uses a small MySQL pool. RDS connections use verified TLS with `DB_SSL_MODE=require`; the current runtime supplies the matching `rds-ca-rsa2048-g1` root CA through `DB_SSL_CA_BASE64`. Browser authentication uses the existing opaque server-side session with `HttpOnly; Secure; SameSite=None`, exact-origin CORS and `credentials: include`. Database credentials remain backend-only Lambda runtime configuration for the MVP; Secrets Manager is optional hardening rather than an initial dependency.
- Consequences: The existing API is reused without a handler rewrite and the initial hosting cost remains low. Lambda concurrency and per-environment connection pools must be capped/observed to protect RDS. The default Amplify/API Gateway domains create a third-party-cookie dependency in some browser/privacy configurations; custom same-site subdomains are preferred before broader production use. The private Lambda runtime has no implicit Internet egress, so later outbound integrations may require a deliberate egress design. Schema migrations need a trusted execution path with private RDS connectivity; manual DDL is not the preferred repeatable deployment mechanism.
- Related stories/PRs: BC-001; PR #7.
