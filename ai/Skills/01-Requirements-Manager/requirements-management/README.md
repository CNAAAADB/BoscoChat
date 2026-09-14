# README — `requirements-management` skill

Knowledge for the **Requirements Manager (RQM)** role: specifying, analysing and tracing software
requirements and the acceptance test specification.

- **Skill file**: [`SKILL.md`](SKILL.md)
- **Used by the agent**: `requirements-manager`
- **References**: [`quality-checklist.md`](references/quality-checklist.md)

## What it provides

- **Requirement template** (ID, text, type, SSIL, source, verification, criterion, status).
- **Quality rules**: atomicity, verifiability, absence of ambiguity, no hidden design.
- Normative keywords (`SHALL`/`SHOULD`/`MAY`) and analysis of the set as a whole.
- **Acceptance test** criteria (Overall SW Test Spec) and optional mapping to ALM.

## Inputs it needs

- System requirements allocated to software, SSIL, interfaces and constraints.

## Expected outputs

- High-quality requirements with traceability and a verification criterion; `SysReq × SwReq` matrix
  with no orphans; acceptance test objectives.

## How to configure it

- It is loaded by the `requirements-manager` agent; it is not invoked on its own.
- In the **project profile** link the **official SwRS template** and the ALM/requirements manager.
- With an ALM MCP (Polarion, DOORS, Codebeamer) map IDs and *satisfies*/*refines* links; without MCP,
  work in file mode.
