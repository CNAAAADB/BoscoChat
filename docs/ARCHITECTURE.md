# BoscoChat Architecture

## Current repository layout
- `backend/`: Node.js + Express API with MySQL access.
- `frontend/`: React + Vite web client.

## Target infrastructure
AWS. Exact services, network boundaries, identity model, data stores, deployment topology and observability must be recorded here as they are decided/implemented.

## Architectural rules
- Keep frontend, backend and persistence boundaries explicit.
- Keep secrets out of source control.
- Validate untrusted input at trust boundaries.
- Enforce authorization server-side.
- Use parameterized database access.
- Document handling of personal data and retention/deletion flows.
