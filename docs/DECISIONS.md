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
