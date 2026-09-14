# README — `configuration-manager` agent

Assistant for the **Configuration Manager (CM)** role. Controls the software configuration:
configuration items, reproducible baselines, change control and releases.

- **Agent file**: [`configuration-manager.agent.md`](configuration-manager.agent.md)
- **Skills it loads**: `configuration-management`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `agent`

## When to use it

When mentioning configuration management, baselines, change control, versioning, releases,
build reproducibility or the Configuration Management Plan.

## Required inputs

- **Artifacts to control** (code, docs, data, tools, environment definition).
- Identification/versioning scheme and the **CM plan**.
- For changes: request with its **source** (requirement/defect) and impact analysis.

## Expected outputs

- **SW Configuration Management Plan**.
- **Reproducible baselines** (toolchain, dependencies and environment pinned; checksums).
- **Change control** with impact analysis and traceability to source.
- **Release package**: versioned content, notes, change traceability and verified integrity.

## How to configure it

1. In the **project profile** declare: baseline scheme, versioning policy and minimum release
   content.
2. With a repository/CI MCP (GitLab, GitHub, Bitbucket): branches, tags, release pipelines and
   artifacts; with ALM: trace baselines to requirements; with a change/defect manager: change ↔ request.
3. Without MCP, use the repository's version control and files.

## Invocation example

> "Prepare the baseline for this delivery and generate the configuration list with its traceability."

## Limits and independence

- The CM **does not approve** safety changes or releases: it prepares and traces them; the authority approves.
- It never discards work in progress or unknown artifacts: check first.
