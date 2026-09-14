# BoscoChat Project Profile

## Repository
- Repository: `CNAAAADB/BoscoChat`
- Default branch: `main`
- Delivery model: branch -> pull request -> CI/review -> merge

## Product stage
- Target: MVP
- Preferred execution style: implement complete user stories with minimal human interruption; escalate only product, architecture, security/privacy or irreversible decisions that materially require human judgment.

## Current detected stack
### Backend
- JavaScript / Node.js
- ECMAScript modules
- Express 5
- MySQL via `mysql2`

### Frontend
- JavaScript / React 19
- Vite 8
- ESLint

### Infrastructure
- AWS is the target hosting environment.
- Exact AWS services / IaC are to be documented when introduced.

## Applicable cybersecurity skills today
Baseline:
- `security-code-review`
- `security-javascript-typescript`
- `security-express`
- `security-react`
- `security-web`
- `security-api`
- `security-database`
- `security-dependencies`
- `security-secrets`

Conditional:
- `security-auth` when auth/session/authorization is touched.
- `security-container` when Docker/container files exist or change.
- `security-iac` when IaC exists or changes.
- `security-cloud` for AWS configuration or cloud architecture.

## Compliance / quality constraints
- GDPR/privacy by design for personal data.
- Secure coding and least privilege.
- No credentials or secrets committed to the repository.
- Findings are recorded with severity and confidence.
- CRITICAL/HIGH security findings block completion by default.

## Role independence
The Developer/Implementer may create implementation and tests, but independent verification/security gates must not be self-approved by the same role when a dedicated reviewer role is available.

## Notes
The imported EN 50716 material is used as a governance/process reference. BoscoChat is not declared a railway safety project; therefore SSIL-specific requirements do not apply unless explicitly enabled by a future project decision.
