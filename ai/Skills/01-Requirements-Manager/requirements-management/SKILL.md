---
name: requirements-management
description: >
  Knowledge for the Requirements Manager (RQM) role of EN 50716: how to specify, analyse and
  manage railway software requirements and their traceability. Includes a requirement template,
  quality rules (atomicity, verifiability, absence of ambiguity), acceptance
  criteria and optional mapping to ALM. Use it when writing or reviewing requirements, the SwRS or the Overall
  Software Test Specification.
---

# Software Requirements Management (RQM) — EN 50716

## 1. Purpose of the role

Produce a **Software Requirements Specification (SwRS)** that is complete, consistent, verifiable
and traceable to the system requirements, together with the acceptance test specification.

## 2. Requirement template

```
ID:            SWREQ-<module>-<nnn>
Text:          The software SHALL <observable capability> [when <condition>] [within <limit>].
Type:          functional | performance | interface | safety | constraint
SSIL:          0 | 1 | 2 | 3 | 4
Source:        [SYSREQ-...]        # upward traceability
Verification:  <how it will be checked: test / analysis / inspection / demonstration>
Criterion:     <objective acceptance condition>
Status:        draft | reviewed | approved
```

## 3. Quality rules (always apply)

- **Atomic**: a single obligation per requirement.
- **Verifiable**: there is an objective method to check it.
- **Unambiguous**: avoid "fast", "adequate", "if possible", "and/or", "etc.".
- **Necessary and unique**: no duplicates or redundant requirements.
- **No hidden design**: describe the *what*, not the *how*.
- **Traceable**: declared upward source and downward links.
- **Consistent**: no conflicts with other requirements.

## 4. Normative keywords

`SHALL` (mandatory), `SHOULD` (recommended), `MAY` (optional). Do not use "shall" in an
ambiguous sense. A safety requirement is always `SHALL` and carries an SSIL inherited from the system.

## 5. Analysis of the set as a whole

- Completeness: do all the system requirements allocated to SW have coverage?
- Consistency: are there conflicts, overlaps or gaps?
- Testability: does every requirement have an acceptance criterion?
- Traceability: `SysReq × SwReq` matrix with no orphans.

## 6. Acceptance tests (Overall SW Test Spec)

For each requirement, define at least one acceptance test objective with an objective
pass/fail criterion. Do not define component tests here (that belongs to the `tester`).

## 7. MCP integration (optional)

| Capability | Examples | Use |
|-----------|----------|-----|
| ALM / requirements | Polarion, DOORS, Codebeamer | Create/read requirement work items and *satisfies*/*refines* links |
| Tasks / issues | Jira, Azure DevOps | Link requirement ↔ source User Story |
| Wiki | Confluence, SharePoint | Publish the reviewed SwRS |

There may be other MCPs. The agent is generic: if there is no MCP, work with files and matrices
in the repository.

## References

| File | Content |
|---------|-----------|
| [`references/quality-checklist.md`](references/quality-checklist.md) | Requirements quality checklist and anti-patterns |
