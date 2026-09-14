# Requirements quality checklist and anti-patterns

## Per-requirement checklist

- [ ] Has a unique and stable ID.
- [ ] Expresses **one** verifiable obligation.
- [ ] Uses a normative keyword (`SHALL`/`SHOULD`/`MAY`) correctly.
- [ ] Has an objective verification criterion and a method (test/analysis/inspection/demonstration).
- [ ] Carries an assigned SSIL that is consistent with the system.
- [ ] Declares an upward source (system requirement) or is marked `TRACE-GAP`.
- [ ] Contains no design or implementation decisions.
- [ ] Uses no ambiguous terms or vague quantifiers.
- [ ] Does not conflict with other requirements.

## Whole-set checklist (SwRS)

- [ ] Every system requirement allocated to software is covered.
- [ ] `SysReq × SwReq` traceability matrix with no orphans.
- [ ] Every requirement has ≥1 acceptance test objective.
- [ ] The "TBD" items have an owner and a closure date.
- [ ] Terminology and units are consistent throughout the document.

## Frequent anti-patterns (reject/rewrite)

| Anti-pattern | Example | Fix |
|------------|---------|------------|
| Ambiguity | "respond quickly" | "respond within ≤ 200 ms" |
| Compound requirement | "log and notify and archive" | split into 3 requirements |
| Hidden design | "use a hash table to..." | describe the behaviour, not the structure |
| Not verifiable | "be easy to use" | objective, measurable criterion |
| Vague quantifier | "handle many requests" | "handle ≥ N requests/s" |
| Double negation | "shall not fail to confirm" | reword positively |

## Safety warning signs

- Safety requirement without SSIL → block.
- Safety requirement marked `SHOULD`/`MAY` → review: safety is mandatory.
- Failure condition (fail-safe) not specified for a safety function → critical gap.
