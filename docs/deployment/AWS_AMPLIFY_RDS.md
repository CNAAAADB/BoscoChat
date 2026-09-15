# AWS deployment baseline: Amplify + API Gateway + Lambda + RDS MySQL

## Purpose

This document defines the MVP deployment path required for BoscoChat user registration/login while the React/Vite frontend is hosted in AWS Amplify.

## Validated deployment snapshot — 2026-09-15

The following non-secret values describe the currently validated MVP authentication deployment in `us-east-1`:

```text
Amplify origin: https://main.dyqpe5eifx600.amplifyapp.com
API Gateway base: https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com
Frontend API base: https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api
Lambda function: boscochat-backend
VPC: vpc-02f28e9c3d2d0eab2
Lambda SG: boscochat-lambda-sg (sg-0c280487ace7bd7b5)
RDS instance: boscochat-db
RDS endpoint: boscochat-db.c8748aycc2rw.us-east-1.rds.amazonaws.com:3306
RDS SG: boscochat-rds-sg (sg-03cc39ee8b10af87a)
Database: boscochat
Application DB user: boscochat_app
RDS CA: rds-ca-rsa2048-g1
```

Validated behavior: API health check, registration, login, server-side session creation, session persistence after browser reload, and logout/session invalidation. The browser does not receive database credentials.

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
Amazon API Gateway HTTP API
  |
  v
AWS Lambda (Node.js + Express via Lambda Web Adapter)
  |
  | private VPC + TLS/MySQL
  v
Amazon RDS for MySQL (private, not publicly accessible)
```

The browser must never connect directly to MySQL/RDS. Amplify only receives the public HTTPS API URL. Lambda is the only application runtime allowed to connect to the database.

## RDS baseline

Use Amazon RDS for MySQL to preserve the existing `mysql2` backend and migration code.

MVP requirements:

- database name: `boscochat`;
- private DB instance (`Public access: No`);
- encryption at rest enabled;
- automated backups enabled;
- DB security group permits TCP/3306 only from approved administration/runtime security groups;
- dedicated application DB user (`boscochat_app`); do not run the application as the RDS master user;
- use TLS from the backend (`DB_SSL_MODE=require`);
- enable `require_secure_transport=ON` in the DB parameter group when practical and verify the application before enforcing it.

Runtime database variables:

```text
DB_HOST=<RDS endpoint>
DB_PORT=3306
DB_USER=boscochat_app
DB_PASSWORD=<value injected into Lambda configuration>
DB_NAME=boscochat
DB_CONNECTION_LIMIT=2
DB_SSL_MODE=require
DB_SSL_CA_BASE64=<base64 PEM of the matching RDS root CA>
```

For the currently validated Lambda deployment, `DB_SSL_CA_BASE64` is required because `mysql2` is configured with certificate verification (`rejectUnauthorized: true`) and the runtime did not validate the RDS chain without the explicit RDS root CA. The RDS instance currently reports `rds-ca-rsa2048-g1`; supply that root certificate only, not an oversized regional bundle. Do not commit the PEM or its base64 representation to the repository.

For the initial low-traffic MVP, keep the MySQL pool deliberately small (`DB_CONNECTION_LIMIT=1` or `2`). Lambda can create multiple execution environments, and each environment owns its own pool. Review RDS connection usage before raising Lambda concurrency or pool size. RDS Proxy is a later scaling option, not an MVP requirement.

## Credential handling for the MVP

The human/master copy of the application DB password may be kept in the project owner's password manager (currently Proton Pass).

For execution, Lambda receives `DB_USER` and `DB_PASSWORD` as Lambda environment variables. Lambda encrypts environment variables at rest; access to function configuration must therefore be restricted with IAM. These values must never be committed to Git, placed in Amplify/Vite variables, returned to the browser, or written to logs.

AWS Secrets Manager is optional for the MVP. It can be introduced later for centralized secret lifecycle/rotation. If it is introduced while Lambda is attached to private subnets, provide appropriate private connectivity (for example a Secrets Manager VPC interface endpoint) rather than adding a NAT Gateway solely for secret retrieval.

## Lambda runtime: existing Express app without a rewrite

BoscoChat keeps the existing Express server. The repository contains `backend/run.sh`, which starts `src/server.js`.

AWS Lambda Web Adapter is attached as a Lambda layer so API Gateway events are translated to ordinary HTTP requests for Express. This avoids duplicating the routes or maintaining a second authentication implementation.

Recommended Lambda configuration:

```text
Runtime: Node.js 22.x
Architecture: x86_64
Handler: run.sh
Memory: 512 MB
Timeout: 15 seconds
Reserved concurrency: 5 (initial safety limit)
```

Attach the current x86 Lambda Web Adapter layer for the deployment region. Verify the current layer version in the official `aws/aws-lambda-web-adapter` documentation when provisioning; layer versions change over time. If `/opt/bootstrap` is missing at initialization, the Web Adapter layer is not attached correctly.

Required Web Adapter variables:

```text
AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap
AWS_LWA_PORT=8080
AWS_LWA_READINESS_CHECK_PATH=/health
PORT=8080
```

Application variables for the validated deployment:

```text
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGINS=https://main.dyqpe5eifx600.amplifyapp.com
SESSION_COOKIE_SAME_SITE=none
DB_HOST=boscochat-db.c8748aycc2rw.us-east-1.rds.amazonaws.com
DB_PORT=3306
DB_USER=boscochat_app
DB_PASSWORD=<runtime value copied from the password manager>
DB_NAME=boscochat
DB_CONNECTION_LIMIT=2
DB_SSL_MODE=require
DB_SSL_CA_BASE64=<base64 PEM for rds-ca-rsa2048-g1>
```

`CORS_ORIGINS` is an exact origin comparison. Do not add a trailing slash, quotes, Markdown syntax, path, or wildcard.

The Lambda function must be attached to the same VPC as RDS using at least two appropriate subnets and a dedicated security group such as `boscochat-lambda-sg`. The RDS security group must allow inbound TCP/3306 from `boscochat-lambda-sg`, not from the public Internet.

A Lambda attached to private VPC subnets does not automatically have Internet egress. The current authentication flow does not require runtime Internet access; avoid adding a NAT Gateway solely for this deployment unless a later feature genuinely needs outbound Internet access.

## Lambda deployment package

Build the deployment package from the `backend/` directory in a Linux environment:

```sh
cd backend
rm -rf node_modules boscochat-backend.zip
npm ci --omit=dev
zip -r boscochat-backend.zip . -x '*.env' '.env' 'test/*'
```

Upload `boscochat-backend.zip` to the Lambda function. The archive root must contain `run.sh`, `src/`, `package.json` and `node_modules/`; do not zip the parent `backend` directory itself.

`run.sh` must retain executable permissions in the deployment archive.

The repository also contains `.github/workflows/lambda-package.yml`, which runs backend checks and creates the Lambda ZIP artifact without requiring AWS credentials.

## API Gateway HTTP API

Create an API Gateway **HTTP API** integrated with the Lambda function. Use the `$default` stage with automatic deployment for the initial MVP.

The validated deployment uses:

```text
Stage: $default
Auto-deploy: enabled
Route: ANY /{proxy+}
Integration: boscochat-backend
Payload format: 2.0
```

Configure CORS with the exact Amplify production origin:

```text
Allow origin: https://main.dyqpe5eifx600.amplifyapp.com
Allow credentials: true
Allow methods: GET, POST, OPTIONS
Allow headers: Content-Type
```

Expand the allowed methods later only when deployed API endpoints require them. Do not use `*` as the allowed origin when credentials/cookies are enabled.

API Gateway and Express both enforce the browser origin. A successful API Gateway CORS response can still be rejected by Express if `CORS_ORIGINS` differs even by a trailing slash. An Express response with `ORIGIN_NOT_ALLOWED` therefore indicates application-origin mismatch rather than an API Gateway failure.

Existing Express routes remain unchanged, including:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
GET  /health
```

## Amplify Hosting configuration

The validated production branch uses:

```text
VITE_API_URL=https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api
```

Amplify only needs non-secret frontend configuration. Do **not** put `DB_PASSWORD`, DB credentials, session tokens, RDS CA material, or other backend secrets into Vite/Amplify frontend variables. Any `VITE_*` value is part of the frontend build and is visible to the browser.

After changing `VITE_API_URL`, redeploy the Amplify branch so Vite rebuilds the frontend. The frontend authentication client uses `credentials: 'include'`.

## Session-cookie note

While the Amplify frontend and API Gateway endpoint are on different sites, use:

```text
SESSION_COOKIE_SAME_SITE=none
NODE_ENV=production
```

The backend emits the session cookie as `HttpOnly; Secure; SameSite=None`. Some browser/privacy configurations can restrict third-party cookies. The preferred production hardening is to place the frontend and API on custom subdomains of the same registrable domain (for example `app.example.org` and `api.example.org`) and then re-evaluate `SameSite=Lax`.

## Database initialization

The repository contains `backend/scripts/migrate.js`. The normal deployment procedure is to run it once against the target database from a trusted execution environment that can reach private RDS:

```sh
cd backend
npm ci
npm run migrate
```

The migration creates/updates the authentication schema, including `users` and `auth_sessions`, enforces unique user emails, and removes legacy plaintext passwords after hashing them. Do not expose migrations through an HTTP endpoint.

During the initial 2026-09-15 provisioning, the VPC-attached CloudShell environment had private RDS connectivity but no Internet access, so it could not clone/install the repository. The empty database was bootstrapped manually with DDL equivalent to the current migration for `users` and `auth_sessions`; `boscochat_app` required `REFERENCES` in addition to `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER` and `INDEX` to create the session foreign key. Future environments should prefer the versioned migration script rather than manual DDL.

## Verification checklist

1. RDS reports `Public access: No`.
2. Lambda uses a dedicated `boscochat-lambda-sg`; RDS allows TCP/3306 from that SG only (plus any explicitly required administration SG).
3. `GET /health` through API Gateway returns HTTP 200.
4. Lambda can establish a verified TLS MySQL connection to RDS using the matching RDS root CA.
5. `users` and `auth_sessions` exist and match the current migration schema.
6. Amplify `VITE_API_URL` points to the API Gateway `/api` base URL.
7. `CORS_ORIGINS` exactly matches the Amplify frontend origin with no trailing slash.
8. API Gateway CORS allows that exact origin with credentials and the required methods/headers.
9. Register a test account; verify `users.password_hash` is populated and no plaintext password is stored.
10. Login creates an `auth_sessions` row and emits an `HttpOnly; Secure; SameSite=None` cookie for the cross-site MVP deployment.
11. Reloading the Amplify app preserves the session through `/api/auth/session`.
12. Logout invalidates the database session.
13. CloudWatch logs contain no DB password, raw session token, CA material, or personal data beyond what is operationally necessary.

The above authentication checks were completed successfully on 2026-09-15 for the validated deployment snapshot.

## Later hardening

Before higher concurrency or production launch, review custom domains, WAF/API throttling, shared/distributed authentication rate limiting, RDS Proxy/connection pressure, Secrets Manager or IAM DB authentication, customer-managed KMS keys where justified, log retention, alarms, backup restore tests, least-privilege IAM policies, and an automated/private migration execution path that does not depend on manual schema DDL.
