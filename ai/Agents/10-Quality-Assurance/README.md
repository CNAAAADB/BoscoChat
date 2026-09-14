# README — `quality-assurance` agent

Assistant for the **Quality Assurance (QA)** role. Ensures that the defined process (plans,
standards, lifecycle) is applied: process audits and non-conformity tracking.

- **Agent file**: [`quality-assurance.agent.md`](quality-assurance.agent.md)
- **Skills it loads**: `quality-assurance`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `agent` (**read-only**)

## When to use it

When mentioning the quality plan, audit, non-conformity, process metrics, compliance with
standards or QA.

## Required inputs

- **Quality plan**, applicable plans and standards.
- **Process evidence** (reviews, analyses, records) and deliverables to audit.
- Audit templates and criteria derived from EN 50716.

## Expected outputs

- **SW Quality Assurance Plan**.
- **Audit reports** (process and product) with objective, traceable findings.
- **Non-conformities** with severity, evidence and corrective action; follow-up through to closure.
- **Metrics** of quality and trends; escalation of systemic risks to the `project-manager`.

## How to configure it

1. In the **project profile** declare: quality plan, audit templates and target metrics.
2. With an ALM MCP (Polarion, DOORS): audit status and traceability; with a task manager (Jira,
   Azure DevOps): record and track non-conformities; with CI/repository: check that the controls
   are executed.
3. Without MCP, use the repository's records and files. It does not grant `edit`.

## Invocation example

> "Audit whether the design phase followed the quality plan and list the non-conformities with evidence."

## Limits and independence

- QA audits the **process**; it does not replace verification or validation of the product.
- It safeguards the role independence required by the SSIL; any violation is a non-conformity.
- QA does not approve the product: it delivers reports to the authority.
