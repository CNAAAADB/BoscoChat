# AWS deployment baseline: Amplify + API Gateway + Lambda + RDS MySQL

## Purpose

This document defines the MVP deployment path required for BoscoChat user registration/login while the React/Vite frontend is hosted in AWS Amplify.

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
```

`DB_SSL_CA_BASE64` may be supplied if the Lambda trust store needs an explicit AWS RDS CA bundle.

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

Attach the current x86 Lambda Web Adapter layer for the deployment region. Verify the current layer version in the official `aws/aws-lambda-web-adapter` documentation when provisioning; layer versions change over time.

Required Web Adapter variables:

```text
AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap
AWS_LWA_PORT=8080
AWS_LWA_READINESS_CHECK_PATH=/health
PORT=8080
```

Application variables:

```text
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGINS=https://<amplify-production-domain>
SESSION_COOKIE_SAME_SITE=none
DB_HOST=<RDS endpoint>
DB_PORT=3306
DB_USER=boscochat_app
DB_PASSWORD=<runtime value copied from the password manager>
DB_NAME=boscochat
DB_CONNECTION_LIMIT=2
DB_SSL_MODE=require
```

The Lambda function must be attached to the same VPC as RDS using at least two appropriate subnets and a dedicated security group such as `boscochat-lambda-sg`. The RDS security group must allow inbound TCP/3306 from `boscochat-lambda-sg`, not from the public Internet.

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

## API Gateway HTTP API

Create an API Gateway **HTTP API** integrated with the Lambda function. Use the `$default` stage with automatic deployment for the initial MVP.

Configure CORS with the exact Amplify production origin:

```text
Allow origin: https://<amplify-production-domain>
Allow credentials: true
Allow methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allow headers: Content-Type
```

Do not use `*` as the allowed origin when credentials/cookies are enabled.

A `$default` route (or `ANY /{proxy+}` plus the root route) can forward the API paths to the Lambda Web Adapter. Existing Express routes remain unchanged, including:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
GET  /health
```

## Amplify Hosting configuration

Amplify only needs non-secret frontend configuration:

```text
VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/api
```

Do **not** put `DB_PASSWORD`, DB credentials, session tokens, or other backend secrets into Vite/Amplify frontend variables. Any `VITE_*` value is part of the frontend build and is visible to the browser.

After changing `VITE_API_URL`, redeploy the Amplify branch so Vite rebuilds the frontend.

## Session-cookie note

While the Amplify frontend and API Gateway endpoint are on different sites, use:

```text
SESSION_COOKIE_SAME_SITE=none
NODE_ENV=production
```

The backend will emit the session cookie as `HttpOnly; Secure; SameSite=None`. Some browser/privacy configurations can restrict third-party cookies. The preferred production hardening is to place the frontend and API on custom subdomains of the same registrable domain (for example `app.example.org` and `api.example.org`) and then re-evaluate `SameSite=Lax`.

## Database initialization

The repository contains `backend/scripts/migrate.js`. Run it once against the production database from a trusted execution environment that can reach private RDS, such as the CloudShell VPC environment used during provisioning:

```sh
cd backend
npm ci
npm run migrate
```

The migration creates/updates the authentication schema, including `users` and `auth_sessions`, enforces unique user emails, and removes legacy plaintext passwords after hashing them.

Do not expose migrations through an HTTP endpoint.

## Verification checklist

1. RDS reports `Public access: No`.
2. Lambda uses a dedicated `boscochat-lambda-sg`; RDS allows TCP/3306 from that SG only (plus any temporary administration SG still required).
3. `GET /health` through API Gateway returns HTTP 200.
4. Lambda can establish a verified TLS MySQL connection to RDS.
5. The production migration completes and `users` / `auth_sessions` exist.
6. Amplify `VITE_API_URL` points to the API Gateway `/api` base URL.
7. `CORS_ORIGINS` exactly matches the Amplify frontend origin.
8. Register a test account; verify `users.password_hash` is populated and no plaintext password is stored.
9. Login creates an `auth_sessions` row and emits an `HttpOnly; Secure; SameSite=None` cookie for the cross-site MVP deployment.
10. Reloading the Amplify app preserves the session through `/api/auth/session`.
11. Logout invalidates the database session.
12. CloudWatch logs contain no DB password, raw session token, or personal data beyond what is operationally necessary.

## Later hardening

Before higher concurrency or production launch, review custom domains, WAF/API throttling, shared/distributed authentication rate limiting, RDS Proxy/connection pressure, Secrets Manager or IAM DB authentication, customer-managed KMS keys where justified, log retention, alarms, backup restore tests and least-privilege IAM policies.
