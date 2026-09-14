# README — `implementer` agent

Assistant for the **Implementer / Developer (IMP)** role. Transforms the design into documented
source code, conforming to the coding standard and to secure, defensive coding.

- **Agent file**: [`implementer.agent.md`](implementer.agent.md)
- **Skills it loads**: `secure-implementation`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `grep`, `agent`

## When to use it

When asking to write, refactor or document code, apply a coding standard, resolve
static analysis findings or trace code to design.

## Required inputs

- **Component Design** and interfaces of the component to implement.
- Approved **coding standard** and **language subset**.
- Project security rules and static analysis configuration.

## Expected outputs

- Correct, defensive, traceable **source code** (`Trace:` to design and requirement).
- Interface contract documentation (pre/post-conditions, invariants, ranges).
- Code in a verifiable state: **static analysis with no open findings** of the required category.
- A note on what the `verifier` must **verify** and what the `tester` must **test**.

## How to configure it

1. In the **project profile**, declare: coding standard (e.g. MISRA + internal rules),
   fixed toolchain, dependency allowlist and forbidden APIs.
2. With a repository/CI MCP (GitLab, GitHub, Bitbucket): branches, MRs and analysis/test pipelines;
   with ALM, link commit/MR ↔ design ↔ requirement; with a defect manager, fix ↔ finding.
3. Without MCP, work directly on the repository files.

## Invocation example

> "Implement this approved component design with defensive coding and traceability comments."

## Limits and independence

- It does not change requirements or design to make implementation easier.
- It does not approve its own work; verification and testing belong to independent roles when required.
