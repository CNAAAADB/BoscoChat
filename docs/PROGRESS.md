# BoscoChat Progress

## Current focus
- BC-002 — PR #13 merged to `main` on 2026-11-02. Producer CI and the SEC-BC002-01/02 remediations are present, but the story remains BLOCKED by independent verification/security, representative MySQL migration/concurrency evidence and audit-log privacy/retention approval.
- BC-003 — Query usage logging and quotas remains BLOCKED after merge pending independent gates and policy approval.
- BC-006 — PR #14 merged test tooling and a private S3/SSE-KMS/IAM proposal on 2026-11-02, but no AWS storage implementation exists and the three catalog SHA-256 values remain blank. The story remains BLOCKED.

## In progress
- None.

## Blocked
- BC-002 — Required: independent functional verification, independent FULL authorization/security review, representative MySQL migration/concurrency validation, and approval of access/retention/deletion for `admin_audit_logs`.
- BC-003 — Required: independent functional verification, independent FULL security confirmation of the CWE-400 remediation in `c74dce1`, and explicit approval or exception acceptance for production quota/reset values and query-log retention.
- BC-006 — Required: verified catalog hashes, approved cloud/privacy decisions, S3/KMS/IAM/backend integration and IaC, representative AWS verification, negative/positive access tests and independent FULL review.
- Production release/deployment only: rotate or revoke the database credential previously committed to Git history and validate backup/restore plus the authentication migration on representative staging data. Per project-owner direction on 2026-09-15, this operational action is deferred and does not block unrelated development stories.

## Ready but not executable
- BC-004 depends on BC-003, which is not DONE.
- BC-007 depends on BC-002 and BC-006, which are not DONE.
- BC-008 depends on BC-007; BC-009 depends on BC-008; BC-010 depends on BC-008; BC-011 depends on BC-008 and BC-010; BC-012 depends on BC-006 and BC-011.
- No READY story is currently executable.

## In review
- None. PR #13 and PR #14 are merged; their remaining gates keep BC-002 and BC-006 BLOCKED rather than IN_REVIEW or DONE.

## Product review
- BC-014 — User profile management and BC-015 — Email verification/controlled email change are separate `IDEA` stories with measurable criteria.
- Both remain non-executable `TRACE-GAP` items until their requirements and privacy/security policies are approved in the SRS baseline.

## Recently merged artifacts
- PR #13 — BC-002 implementation and producer checks; merged 2026-11-02 while independent gates remained open.
- PR #14 — private corpus tooling and BC-006 architecture proposal; merged 2026-11-02 with blank catalog hashes and without AWS storage implementation.

## Recently completed
- AWS MVP authentication runtime validated end-to-end on 2026-09-15: Amplify frontend, API Gateway HTTP API, Lambda/Express via Lambda Web Adapter, private RDS MySQL, verified RDS TLS, exact-origin CORS, registration, login, persisted session/reload and logout. Architecture and deployment evidence were documented in PR #8 and merged to `main`.
- BC-001 — User registration and authentication. PR #4 merged on 2026-09-14. Independent code/functional verification and FULL source-based security review recorded in PR #5. Acceptance criteria pass; release constraints remain listed separately above.
