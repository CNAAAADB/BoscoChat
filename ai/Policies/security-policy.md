# Security policy

## Principles
- Treat security as a development lifecycle concern, not a final scanner step.
- Prefer least privilege, secure defaults, defense in depth and explicit trust boundaries.
- Never suppress a finding without documented technical rationale.
- Never expose complete secrets, credentials or sensitive personal data in reports.
- Require regression tests for fixed vulnerabilities when practical.
- Keep detection logic separate from organizational gate policy.

## Minimum review coverage
Every production change receives at least FAST review. Authentication/authorization, internet-facing APIs, cryptography, secret handling, infrastructure exposure and tenant isolation changes require FULL review by default.
