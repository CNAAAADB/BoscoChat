# README — `project-manager` agent

Assistant for the **Project Manager (PM)** role. Plans and leads the project and its lifecycle:
planning, role/competence assignment, risks and tracking of V&V milestones.

- **Agent file**: [`project-manager.agent.md`](project-manager.agent.md)
- **Skills it loads**: `software-project-management`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `agent`

## When to use it

When mentioning software planning, lifecycle, role assignment, risks, milestones, dependencies or
project tracking.

## Required inputs

- Project **scope** and the **SSIL** of the components.
- Available **team** with their competences.
- Existing project plan, dependencies and constraints.

## Expected outputs

- **Software plan** aligned with the EN 50716 lifecycle.
- **Role assignment** verifying competence and **independence** per SSIL.
- **Risk register** with mitigations and owners.
- **V&V milestones** with evidence-based entry/exit criteria; status reports.

## How to configure it

1. In the **project profile** declare: project plan, competence/independence matrix and the
   definition of milestones/gates.
2. With a task manager MCP (Jira, Azure DevOps): plan, assign and track milestones; with ALM:
   track deliverable status; with a wiki (Confluence): publish plans and reports.
3. Without MCP, use plans and boards in the repository.

## Invocation example

> "Produce the lifecycle plan for an SSIL 4 component with the assignment of independent roles."

## Limits and independence

- It does not assign a person incompatible roles for the SSIL (e.g. author and verifier of the same item).
- It does not push to skip V&V for schedule reasons; safety milestones are closed by evidence.
- The PM **does not rule** on safety fitness: that belongs to VAL/ASR and the authority.
