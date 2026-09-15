# AWS deployment baseline: Amplify + API + RDS MySQL

## Purpose

This document defines the production path required for BoscoChat user registration/login to work while the web frontend is hosted in AWS Amplify.

## Network and trust boundaries

```text
Browser
  |
  | HTTPS
  v
AWS Amplify Hosting (React/Vite)
  |
  | HTTPS + credentials/include
  v
BoscoChat backend API (recommended initial runtime: AWS App Runner)
  |
  | private VPC egress + TLS/MySQL
  v
Amazon RDS for MySQL (private, not publicly accessible)
```

The browser must never connect directly to MySQL/RDS. Amplify Hosting only needs the public HTTPS URL of the BoscoChat API. The backend is the only component allowed to connect to the database.

## RDS baseline

Use Amazon RDS for MySQL to preserve the existing `mysql2` backend and migration code.

Production requirements:

- database name: `boscochat`;
- private DB instance/cluster (`Public access: No`);
- encryption at rest enabled;
- automated backups enabled;
- DB security group permits TCP/3306 only from the backend runtime/VPC connector security group;
- `require_secure_transport=ON` in the MySQL DB parameter group;
- dedicated application DB user; do not run the application as the RDS master user;
- DB credentials stored in AWS Secrets Manager or the backend runtime's secret-reference facility, never in Git or Amplify frontend variables.

The application runtime variables are:

```text
DB_HOST=<RDS endpoint>
DB_PORT=3306
DB_USER=<application DB user>
DB_PASSWORD=<secret reference/value injected at runtime>
DB_NAME=boscochat
DB_CONNECTION_LIMIT=10
DB_SSL_MODE=require
```

`DB_SSL_CA_BASE64` may be supplied when the runtime trust store needs the AWS RDS CA bundle explicitly.

## Backend runtime

For the current Express backend, App Runner is the least disruptive initial AWS runtime. Configure App Runner outbound VPC access so it can reach the private RDS instance. The API remains reachable over HTTPS while database traffic stays inside the VPC.

Backend production variables:

```text
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
CORS_ORIGINS=https://<amplify-production-domain>
SESSION_COOKIE_SAME_SITE=none
DB_HOST=<RDS endpoint>
DB_PORT=3306
DB_USER=<application DB user>
DB_PASSWORD=<runtime secret>
DB_NAME=boscochat
DB_CONNECTION_LIMIT=10
DB_SSL_MODE=require
```

When the frontend and API are later moved to custom subdomains under the same registrable domain (for example `app.example.org` and `api.example.org`), `SESSION_COOKIE_SAME_SITE=lax` can normally be used again after verifying browser behaviour.

## Amplify Hosting configuration

Amplify only needs non-secret frontend configuration:

```text
VITE_API_URL=https://<backend-api-host>/api
```

Do **not** put `DB_PASSWORD`, database credentials, session secrets, or other backend secrets into Vite/Amplify frontend variables. Any `VITE_*` value is part of the frontend build and is visible to the browser.

## Database initialization

The repository already contains `backend/scripts/migrate.js`. Run it once against the production database from a trusted execution environment that can reach the private RDS instance:

```sh
cd backend
npm ci
npm run migrate
```

The migration creates/updates the authentication schema, including `users` and `auth_sessions`, enforces unique user emails, and removes legacy plaintext passwords after hashing them.

Do not run production schema migration from the public browser or expose a migration HTTP endpoint.

## Verification checklist

1. `GET /health` returns 200 from the deployed API.
2. RDS is not publicly accessible.
3. Backend can establish a TLS MySQL connection to RDS.
4. Run `npm run migrate` successfully.
5. Amplify `VITE_API_URL` points to the deployed API `/api` base URL.
6. Backend `CORS_ORIGINS` exactly matches the Amplify frontend origin.
7. With separate Amplify/App Runner domains, `SESSION_COOKIE_SAME_SITE=none` and HTTPS are enabled.
8. Register a test account; verify `users.password_hash` is populated and no plaintext password is stored.
9. Login creates an `auth_sessions` row and sends an HttpOnly + Secure + SameSite=None cookie when cross-site hosting is used.
10. `/api/auth/session` succeeds from the Amplify frontend after login.
11. Logout invalidates the database session.

## Later hardening

Before production scale, evaluate RDS Proxy or an alternative managed connection-pooling layer if backend autoscaling causes excessive database connections. Keep the database private regardless of the pooling approach.
