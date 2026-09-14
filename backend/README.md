# BoscoChat backend

## Runtime configuration

Copy the variable names from `.env.example` into the deployment secret/configuration system. Do not commit real values. `DB_USER` and `DB_PASSWORD` are mandatory. In production, serve the API over HTTPS so the session cookie is emitted with `Secure`; set `CORS_ORIGINS` to the exact trusted web origins and `TRUST_PROXY=1` only behind a trusted single reverse proxy.

## Authentication migration (BC-001)

Before deploying this version:

1. Back up the `users` table and test restoration.
2. Resolve duplicate email addresses if any exist.
3. Run `npm run migrate` with the runtime database variables.
4. Verify that `users.password_hash` is populated, the legacy plaintext `password` column is absent, and `auth_sessions` exists.
5. Rotate the database password previously embedded in source history before starting the API.

The migration fails explicitly if it cannot establish unique emails or if any account remains without a password hash. It converts legacy plaintext values to salted `scrypt` hashes before removing the plaintext column.

## Checks

```sh
npm ci
npm run build
npm run lint
npm test
npm audit --audit-level=high
```
