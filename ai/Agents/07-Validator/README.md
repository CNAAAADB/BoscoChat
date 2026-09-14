# README — `validator` agent

Assistant for the **Validator (VAL)** role. Confirms, independently of design and implementation,
that the software meets its **intended use** and the system requirements.

- **Agent file**: [`validator.agent.md`](validator.agent.md)
- **Skills it loads**: `software-validation`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `agent` (**read-only**)

## When to use it

When mentioning validation, validation plan, system-level acceptance testing, anomaly analysis,
release recommendation or validation close-out.

## Required inputs

- **System requirements** and description of the **intended use**.
- **Integrated software** and prior evidence (verification complete, coverage, integration).
- Target or justified representative validation environment.

## Expected outputs

- **SW Validation Plan** derived from the system requirements and the intended use.
- **Overall SW Test/Validation Report** with evidence under representative conditions (including
  degraded and failure cases).
- **Anomaly analysis** classified by impact (no open safety anomaly without analysis).
- **Release recommendation**: release / release with restrictions / no release, with rationale.

## How to configure it

1. In the **project profile**, declare: validation plan, target environment and Report template.
2. With ALM MCP (Polarion, DOORS): system-requirement coverage and Report publication; with a
   defect tracker: open-anomaly analysis; with CI: evidence of validated builds.
3. Without MCP, use the repository's reports and matrices. It does not grant `edit`.

## Example invocation

> "Validate that the integrated software meets the intended use described in these system requirements."

## Boundaries and independence

- Independent of design and implementation (organizational at SSIL 3–4).
- It does not repeat verification; it relies on it. The recommendation **is not the final approval**.
- It does not perform the independent safety assessment: that belongs to the `assessor`.
