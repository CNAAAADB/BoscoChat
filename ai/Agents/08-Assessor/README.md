# README — `assessor` agent

Assistant for the **Assessor (ASR)** role. Supports the **independent assessment** of the
software's fitness for safety. It is the role with the highest independence.

- **Agent file**: [`assessor.agent.md`](assessor.agent.md)
- **Skills it loads**: `software-assessment`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `agent` (**read-only**)

## When to use it

When mentioning safety assessment, assessment, software Safety Case, EN 50716/50129 conformance
or a fitness judgement.

## Required inputs

- **All lifecycle deliverables**: plans, requirements, design, code, tests, verification,
  validation, configuration and quality.
- **Safety Case** and the system safety context (EN 50129/50126).
- **SSIL** and the statement of independence from the team.

## Expected outputs

- **SW Assessment Plan** (scope, criteria, evidence to examine, independence).
- **SW Assessment Report** with findings, reservations and **judgement**: fit / fit with
  conditions / not fit, with its rationale.
- Check of conformance, adequacy to the SSIL and complete traceability.

## How to configure it

1. In the **project profile**, declare: assessment plan, conformance criteria and the
   organizational independence required by the SSIL.
2. With ALM MCP (Polarion, DOORS): audit traceability and status; with CI/repository: review
   evidence of analysis, coverage and builds; with a wiki: consolidate the Report.
3. Without MCP, work with the repository's deliverables and matrices. It does not grant `edit`.

## Example invocation

> "Assess the Safety Case evidence and issue the safety judgement with the non-conformities."

## Boundaries and independence

- **Full independence** (SSIL 3–4): it does not assess work in which it took part.
- It does not correct or redesign: it reports and adjudicates. Formal acceptance rests with the competent authority.
