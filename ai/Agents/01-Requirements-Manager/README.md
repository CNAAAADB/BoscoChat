# README — `requirements-manager` agent

Assistant for the **Requirements Manager (RQM)** role. Specifies, analyses and traces software
requirements and the acceptance test specification.

- **Agent file**: [`requirements-manager.agent.md`](requirements-manager.agent.md)
- **Skills it loads**: `requirements-management`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `agent`

## When to use it

When mentioning software requirements, SwRS, acceptance criteria, requirements analysis,
ambiguity, requirement↔system traceability or the acceptance test specification.

## Required inputs

- **System requirements** (EN 50126/50129) allocated to software.
- **Safety allocation (SSIL)** per component.
- Interfaces, constraints and operational context.

## Expected outputs

- **Atomic, verifiable and unambiguous** requirements, with an ID and SSIL.
- Quality analysis (completeness, consistency, conflicts, testability).
- **Traceability matrix** (upward/downward) with every `TRACE-GAP` marked.
- **Overall Software Test Specification** (acceptance level).
- A note on what the human RQM must approve and what the `verifier` must verify.

## How to configure it

1. In the **project profile** declare: the official SwRS template, where the system requirements
   live and the ALM/requirements manager.
2. If an ALM MCP is available (Polarion, DOORS, Codebeamer), map the IDs and *satisfies*/*refines*
   links; if a task manager is available (Jira, Azure DevOps), link each requirement to its User Story.
3. Without MCP, work in **file mode** (matrices and documents in the repo).

## Invocation example

> "Derive the software requirements from these SSIL 3 system requirements and mark every TRACE-GAP."

## Limits and independence

- It does not design or implement; it describes the *what*, not the *how*.
- It does not verify its own specification: it delegates to the `verifier`. Approval is human.
