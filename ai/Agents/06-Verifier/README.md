# README — `verifier` Agent

Assistant for the **Verifier (VER)** role. It checks, in an adversarial and independent way, that
the outputs of each phase meet their inputs. It **does not modify** artifacts: it reviews and reports.

- **Agent file**: [`verifier.agent.md`](verifier.agent.md)
- **Skills it loads**: `software-verification`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `grep`, `agent` (**read-only**, does not edit)

## When to use it

When asked to verify a phase, review a deliverable against its inputs, analyze
coverage/traceability or consolidate verification findings.

## Required inputs

- The **artifact to verify** (requirements, design, code, tests or integration) with its revision.
- Its **reference inputs** (what it was meant to satisfy) and the applicable standards.
- **SSIL** (determines the required techniques) and the traceability matrix.

## Expected outputs

- **SW Verification Plan** and per-phase **Verification Reports**.
- Findings classified by **severity, impact and confidence**, with reproducible evidence and a
  reference (EN 50716 clause / CWE / standard rule).
- Marking of every `TRACE-GAP` and an assessment of coverage sufficiency.

## How to configure it

1. In the **project profile**, declare: verification plan, checklists and per-SSIL criteria.
2. With a repository/CI MCP (GitLab, GitHub): review MRs, run static analysis and read
   coverage; with ALM (Polarion, DOORS): check traceability and record the Report.
3. Without MCP, work on the repository artifacts. It does **not** grant `edit` (it reviews, it does not fix).

## Invocation example

> "Verify that this design satisfies all assigned requirements and list the findings with evidence."

## Limits and independence

- It does not modify the verified artifact; it does not verify what it produced itself (SSIL ≥ 1).
- The absence of findings is not a guarantee: document scope and limitations. It does not approve.
