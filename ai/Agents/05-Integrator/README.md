# README — `integrator` Agent

Assistant for the **Integrator (INT)** role. It integrates software components with one another
and with the hardware, planning the sequence and the interface tests.

- **Agent file**: [`integrator.agent.md`](integrator.agent.md)
- **Skills it loads**: `software-integration`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `agent`

## When to use it

When software integration, SW/HW integration, interface tests between components, system
assembly or an incremental integration strategy are mentioned.

## Required inputs

- **Components that have already passed their component test** (`tester`).
- **Interface specification** and integration plan.
- Target environment or representative test bench (HIL/SIL) where applicable.

## Expected outputs

- **Integration strategy and sequence** (incremental, by critical interfaces).
- Reproducible **SW & SW/HW Integration Test Specification & Report**.
- Evidence of interface behavior (data, control, timing, errors).
- Record and traceability of **incompatibilities** and failed integrations.

## How to configure it

1. In the **project profile**, declare: integration environment, HIL/SIL test benches and Report template.
2. With a CI MCP (GitLab, GitHub): integration builds and test benches; with ALM, link tests to
   interfaces and requirements; with a defect manager, record incompatibilities.
3. Without MCP, use integration scripts and repository files.

## Invocation example

> "Define the incremental integration strategy for these components and their interface tests."

## Limits and independence

- It does not modify components to "make them fit": design changes go back to the `designer`.
- It does not validate or approve the system: that belongs to the `validator`, the `assessor` and an authorized person.
