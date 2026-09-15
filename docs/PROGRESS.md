# BoscoChat Progress

## Current focus
- BC-003 — Query usage logging and quotas is implemented and awaiting review. BC-002 was skipped by this automation because its feature branch already exists.
- Automated development may proceed against the validated AWS MVP architecture now present on `main`: Amplify Hosting -> API Gateway HTTP API -> Lambda/Express via Lambda Web Adapter -> private RDS MySQL.

## In progress
- None.

## Blocked
- Production release/deployment only: rotate or revoke the database credential previously committed to Git history and validate backup/restore plus the authentication migration on representative staging data. Per project-owner direction on 2026-09-15, this operational action is deferred and does not block subsequent development stories.
- BC-006 — Documentary data model and protected storage requires an approved storage architecture/provider, encryption and authorization decision before implementation.

## In review
- BC-003 — Query usage logging and quotas; implementation, automated tests, migration, architecture and traceability are included in the feature PR.

## Recently completed
- AWS MVP authentication runtime validated end-to-end on 2026-09-15: Amplify frontend, API Gateway HTTP API, Lambda/Express via Lambda Web Adapter, private RDS MySQL, verified RDS TLS, exact-origin CORS, registration, login, persisted session/reload and logout. Architecture and deployment evidence were documented in PR #8 and merged to `main`.
- BC-001 — User registration and authentication. PR #4 merged on 2026-09-14. Independent code/functional verification and FULL source-based security review recorded in PR #5. Acceptance criteria pass; release constraints remain listed separately above.
