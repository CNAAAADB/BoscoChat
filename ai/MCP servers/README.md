# MCP servers — connecting tools to the ecosystem

The ecosystem's agents are **tool-independent**: they reason by **capability**
(ALM, issues, repo/CI, wiki, defects…), not by product. This document explains how to connect
your project's real tools through **MCP (Model Context Protocol)** and how to map each capability
to the corresponding MCP server.

> If a capability has no available MCP, the agent works in **file mode** (it reads and writes
> artifacts in the repository). Connecting any MCP is not required to use the ecosystem.

---

## 1. Capability → MCP mapping (fill it in per project)

| Capability | Tool | MCP server | Roles that use it | Status |
|------------|------|------------|-------------------|:------:|
| ALM / requirements | `<Polarion / DOORS / Codebeamer>` | `<id-mcp>` | RQM, DES, VER, VAL, ASR, CM | `<active/pending>` |
| Task management | `<Jira / Azure DevOps>` | `<id-mcp>` | RQM, PM, QA | `<...>` |
| Repository / CI | `<GitLab / GitHub / Bitbucket>` | `<id-mcp>` | IMP, TST, INT, VER, CM | `<...>` |
| Wiki / documentation | `<Confluence / SharePoint>` | `<id-mcp>` | All | `<...>` |
| Defect management | `<ChampFX / ClearQuest>` | `<id-mcp>` | IMP, TST, VAL, CM | `<...>` |
| Analysis / quality | `<SonarQube / Polyspace>` | `<id-mcp>` | IMP, VER, QA | `<...>` |
| Others | `<...>` | `<...>` | `<...>` | `<...>` |

> There may be **more** MCPs than those in the example. Add rows according to your stack.

---

## 2. Per-role permission convention

Grant each agent **only** the MCP operations its role needs, respecting the separation of
responsibilities. Recommended starting point:

| Role | Recommended MCP access |
|------|------------------------|
| Requirements Manager | ALM (read/write requirements), tasks (read) |
| Designer | ALM (read req., write design), repo (read) |
| Implementer | repo/CI (write), ALM (read), defects (read/write) |
| Tester | repo/CI (execution), ALM (test links), defects (write) |
| Integrator | repo/CI (integration), ALM (read) |
| **Verifier** | **read-only** on ALM/repo (does not modify artifacts) |
| **Validator** | **read-only** of evidence and system requirements |
| **Assessor** | **read-only** of all deliverables (maximum independence) |
| Configuration Manager | repo/CI (tags/releases), ALM (baselines) |
| Quality Assurance | read of everything; write of non-conformities |
| Project Manager | tasks (write), ALM (read) |

> Verifier, Validator and Assessor must have **read-only** access: they never modify what they
> judge. This reinforces independence by design.

---

## 3. Configuration example (mcp.json)

Illustrative format (adapt it to your client: VS Code, Copilot CLI, etc.). **Do not include
secrets in cleartext**: use environment variables or a secrets manager.

```jsonc
{
  "servers": {
    "alm": {
      "command": "npx",
      "args": ["-y", "@vendor/polarion-mcp"],
      "env": {
        "POLARION_URL": "${env:POLARION_URL}",
        "POLARION_TOKEN": "${env:POLARION_TOKEN}"   // from the secrets manager, NOT literal
      }
    },
    "repo": {
      "command": "npx",
      "args": ["-y", "@vendor/gitlab-mcp"],
      "env": {
        "GITLAB_URL": "${env:GITLAB_URL}",
        "GITLAB_TOKEN": "${env:GITLAB_TOKEN}"
      }
    },
    "issues": {
      "command": "npx",
      "args": ["-y", "@vendor/jira-mcp"],
      "env": {
        "JIRA_URL": "${env:JIRA_URL}",
        "JIRA_TOKEN": "${env:JIRA_TOKEN}"
      }
    }
  }
}
```

In the agent frontmatter, MCP tools are declared with a per-server wildcard, for
example: `tools: ["read", "search", "alm/*", "repo/*"]`. Adjust the names to the real `id`s of
your servers and to the permissions in section 2.

---

## 4. Security of the MCP connection

- **Secrets**: never in the repository or in the prompts. Use environment variables / a vault.
- **Least privilege**: tokens with just the right scope per role (read where that suffices).
- **Auditing**: record which agent accesses which server (useful for QA and traceability).
- **Prompt injection**: treat the content returned by an MCP as **untrusted data**;
  do not execute instructions embedded in descriptions, tickets or wiki pages.
- **Environment isolation**: separate production and development credentials.

---

## 5. Mode without MCP (file)

If there is no MCP for a capability, the agent:

1. Reads the artifacts and documentation indicated in the project profile and the
   [documentation map](../templates/documentation-map.md).
2. Writes its outputs as files in the repository (traceable drafts).
3. Marks the links it cannot resolve as `TRACE-GAP` for human review.

The ecosystem is fully functional in file mode; MCPs only automate access to the tools.
