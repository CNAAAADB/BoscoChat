# README — `designer` agent

Assistant for the **Designer (DES)** role. Transforms the SwRS into architecture and detailed design of
components and interfaces, appropriate to the SSIL.

- **Agent file**: [`designer.agent.md`](designer.agent.md)
- **Skills it loads**: `software-design`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `agent`

## When to use it

When mentioning software architecture, component design, interfaces, design decisions,
patterns or the justification of a design against requirements.

## Required inputs

- **Approved SwRS** (software requirements).
- **SSIL** per component and constraints (performance, safety, real time, memory).
- Approved technologies and project design standards.

## Expected outputs

- **SW Architecture Specification** (components, responsibilities, flows, decisions/ADR).
- **SW Design / Component Design Specification** (detailed design per component).
- **Interface specification** (contracts, pre/post-conditions, invariants, failure modes).
- **Traceability matrix** requirement↔design element (no orphans).
- A note on what the human DES reviews and what the `verifier` checks.

## How to configure it

1. In the **project profile** declare: the architecture/design template, internal guidelines and ADRs.
2. With an ALM MCP, link each design element to its requirement; with a wiki (Confluence, SharePoint),
   publish diagrams and decisions.
3. Without MCP, use diagrams (e.g. Mermaid) and documents in the repository.

## Invocation example

> "Propose the architecture for these SSIL 3 requirements and justify each decision with its alternative."

## Limits and independence

- It does not implement final code and does not verify its own design.
- It does not introduce unapproved dependencies/languages and does not change external interfaces without instruction.
