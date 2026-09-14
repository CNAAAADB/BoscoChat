# BoscoChat LLM Instructions

This repository is operated by multiple AI-assisted roles. All chats, scheduled tasks, and agents working on BoscoChat MUST read this file before making changes.

## Sources of truth
- Product work and priorities: `docs/BACKLOG.md`
- Current delivery status: `docs/PROGRESS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Architecture/product decisions: `docs/DECISIONS.md`
- Requirement-to-code/test/PR traceability: `docs/TRACEABILITY.md`
- Project-specific agent context: `ai/project-profile.md`
- Role definitions: `ai/Agents/`
- Reusable workflows and checks: `ai/Skills/`
- Security policies: `ai/Policies/`

## Operating rules
1. Work from a user story or explicitly scoped maintenance task.
2. Never develop directly on `main`; use a branch and pull request.
3. Prefer complete, reviewable functionality over partial scaffolding.
4. Keep requirements, design, implementation, tests and PR evidence traceable.
5. A producer must not independently verify its own work when an independent role exists.
6. A bug fix must include a regression test whenever technically feasible.
7. Do not mark work `DONE` until required tests and quality/security gates pass.
8. Do not commit credentials, tokens, personal data, generated secrets or local environment files.
9. Treat GDPR/privacy as a design constraint whenever personal data is processed.
10. If evidence is missing, record a `TRACE-GAP` rather than assuming compliance.
11. Do not weaken tests, security controls, linting or validation merely to make CI pass.
12. Changes to architecture, public APIs, authentication, authorization, personal-data handling, or deployment require updating the relevant documentation.

## Chat / role mapping
- **Backlog chat**: use Requirements Manager + Project Manager skills. Own `BACKLOG.md` and `PROGRESS.md`.
- **Orchestrator chat**: coordinate roles, PRs, CI failures, verification, QA, integration and cybersecurity. It does not replace specialist roles.
- **Developer chat**: use Implementer and applicable implementation/testing skills. Implement complete stories, tests and PRs.
- **Mockups / Design chat**: use Designer skills and maintain `docs/mockups/` plus design decisions.
- **Cybersecurity reviewer**: use `ai/Agents/12-Cybersecurity/` and only the security skills relevant to the detected stack/change.

## Skill loading
Load only the skills relevant to the current work. For cybersecurity reviews, use `ai/Skills/_shared/stack-detection/` when the stack is not explicitly known, then load the applicable language/framework/domain skills.

## Definition of Done
A story can be marked `DONE` only when all applicable items are satisfied:
- acceptance criteria met;
- design/mockup respected when applicable;
- implementation complete;
- automated tests added or updated;
- regression test added for bug fixes where feasible;
- build/lint/tests pass;
- security review/gate passes for security-relevant changes;
- privacy/GDPR implications addressed when personal data is involved;
- traceability updated;
- PR merged.

Project-specific instructions override generic framework examples when they conflict. Security policies remain mandatory unless a documented risk acceptance explicitly says otherwise.
