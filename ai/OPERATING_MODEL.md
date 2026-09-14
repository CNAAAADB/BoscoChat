# BoscoChat Agent Operating Model

## Primary project chats

### 1. Backlog / Product
Uses:
- `Agents/01-Requirements-Manager`
- `Agents/11-Project-Manager`

Responsibilities:
- create/refine user stories;
- set priority and dependencies;
- keep acceptance criteria testable;
- maintain `docs/BACKLOG.md` and `docs/PROGRESS.md`;
- ensure each executable story has enough context for Design/Developer.

### 2. Orchestrator
Uses:
- `Agents/00-Orchestrator`
- `Agents/04-Tester`
- `Agents/05-Integrator`
- `Agents/06-Verifier`
- `Agents/07-Validator` when product validation is required;
- `Agents/09-Configuration-Manager`
- `Agents/10-Quality-Assurance`
- `Agents/12-Cybersecurity`

Responsibilities:
- select the next executable work from the backlog;
- coordinate specialist roles;
- inspect PR/CI failures and route remediation;
- enforce quality, traceability and security gates;
- update status after objective evidence exists.

### 3. Developer
Uses:
- `Agents/03-Implementer`
- relevant `Skills/03-Implementer/` skills;
- relevant stack skills;
- testing guidance as needed.

Responsibilities:
- implement a complete scoped story;
- add/update tests;
- create branch/commits/PR;
- respond to CI and review feedback;
- never mark independent verification/security review as passed on its own authority.

### 4. Mockups / Design
Uses:
- `Agents/02-Designer`
- `Skills/02-Designer/software-design`

Responsibilities:
- produce UX/UI mockups/specifications and software design artifacts;
- save project-facing outputs in `docs/mockups/` and architecture/decision docs;
- link design artifacts to user stories.

### 5. Cybersecurity Reviewer
Uses:
- `Agents/12-Cybersecurity`
- shared stack detection/finding/gate skills;
- only relevant language/framework/domain security skills.

Responsibilities:
- independently assess code/configuration/dependency/IaC changes;
- normalize findings and apply the security gate;
- verify remediations independently from the Developer.

## Normal story flow
`BACKLOG -> DESIGN (if needed) -> IMPLEMENT -> TEST -> SECURITY (as applicable) -> VERIFY -> PR/CI -> MERGE -> DONE`

A phase may be skipped only when genuinely not applicable, and the reason should be evident from the story/PR context.
