# BoscoChat Progress

## Current focus
- BC-002 — PR #13 SHA `a62f0dd` contains the CWE-362/admin-audit remediations and passing backend/frontend CI, but remains BLOCKED by independent verification/security, representative MySQL migration/concurrency evidence and audit-log privacy/retention approval.
- BC-003 — Query usage logging and quotas remains BLOCKED after merge pending independent gates and policy approval.
- BC-006 — BLOCKED while DEC-005 (private S3, KMS encryption, least-privilege IAM and backend-authorized access) remains proposed and unverified.
- PR #14 SHA `880cbb0` is a draft test-corpus artifact with passing script tests. The owner authorization covers private BoscoChat testing; real PDF checksums, independent review and BC-006 architecture decisions remain pending, and it does not implement BC-006/007/008.

## In progress
- None.

## Blocked
- BC-002 — PR #13 is open and mergeable. SEC-BC002-01/02 remediations and backend/frontend CI are present on `a62f0dd`; required gates are independent functional verification, independent FULL security review, representative MySQL migration/concurrency validation, and audit-log access/retention approval.
- BC-003 — Code is on `main`, but completion remains blocked pending independent functional verification, independent FULL security confirmation of the CWE-400 remediation in `c74dce1`, and explicit approval or exception acceptance for production quota/reset values and query-log retention.
- BC-006 — Storage architecture/provider, encryption, IAM, backend authorization and operational policies are proposed in DEC-005 but not approved, implemented or independently verified.
- Production release/deployment only: rotate or revoke the database credential previously committed to Git history and validate backup/restore plus the authentication migration on representative staging data. Per project-owner direction on 2026-09-15, this operational action is deferred and does not block unrelated development stories.

## Ready but not executable
- BC-004 depends on BC-003, which is not DONE.
- BC-007 depends on BC-002 and BC-006, which are not DONE.
- BC-008 depends on BC-007; BC-009 depends on BC-002; BC-010 depends on BC-008; BC-011 depends on BC-008 and BC-010; BC-012 depends on BC-008 and BC-011.
- No READY story is currently executable.

## In review
- None. PR #13 and PR #14 are active artifacts, but their gates are BLOCKED; an open PR does not override the story status.


## Product review
- BC-014 — User profile management and BC-015 — Email verification/controlled email change are separate `IDEA` stories with measurable criteria.
- Both remain non-executable `TRACE-GAP` items until their requirements, privacy/security policies and dependencies are approved in the SRS baseline.

## Recently completed
- AWS MVP authentication runtime validated end-to-end on 2026-09-15: Amplify frontend, API Gateway HTTP API, Lambda/Express via Lambda Web Adapter, private RDS MySQL, verified RDS TLS, exact-origin CORS, registration, login, persisted session/reload and logout. Architecture and deployment evidence were documented in PR #8 and merged to `main`.
- BC-001 — User registration and authentication. PR #4 merged on 2026-09-14. Independent code/functional verification and FULL source-based security review recorded in PR #5. Acceptance criteria pass; release constraints remain listed separately above.

