# README — Agent `en50716-orchestrator`

Orchestrator of the ecosystem. It coordinates the role agents, enforces the separation of
responsibilities and independence by SSIL, and maintains traceability across phases.

- **Agent file**: [`en50716-orchestrator.agent.md`](en50716-orchestrator.agent.md)
- **Skills it loads**: `en50716-lifecycle`
- **Tools**: `read`, `search`, `agent` (does not edit)

## When to use it

- The task spans **several phases** of the lifecycle (e.g. an end-to-end User Story).
- **It is unclear which role** intervenes.
- Implementation → verification → validation → assessment must be **chained** while respecting
  independence.

## Required inputs

- The **high-level goal or task** (User Story, change, incident).
- The applicable **SSIL** (if unknown, the agent will ask for it before chaining V&V).
- Access to the existing artifacts and, where appropriate, to the **project profile**.

## Expected outputs

- The role(s) involved and the **execution order**.
- Artifacts produced by each role and their **traceability links**.
- Findings and discrepancies (with both positions if two roles disagree).
- The **independent roles** that must intervene next.
- **Pending human reviews/sign-offs**.

## How to configure it

1. It requires no editing of the core. Make sure the role agents are available in your client
   (same `Agents/`).
2. Load the **project profile** at the start of the session so it applies your SSIL, processes,
   and tools.
3. Coordination-only tools (`read`, `search`, `agent`): it deliberately does not grant `edit`.

## Invocation example

> "I have this User Story. Chain the necessary roles while respecting the independence by SSIL and
> tell me what each one delivers and what a person must sign."

## Key rules

- Never lets the same agent verify/validate/assess what it produced.
- The absence of findings is not a guarantee of correctness.
- It does not close a flow without naming the pending human sign-offs.
