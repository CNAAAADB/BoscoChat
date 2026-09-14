# README — `tester` agent

Assistant for the **Tester (TST)** role. Designs and executes component/integration tests derived from
requirements and design, with reproducible evidence and coverage appropriate to the project.

- **Agent file**: [`tester.agent.md`](tester.agent.md)
- **Skills it loads**: `software-testing`, `en50716-lifecycle`
- **Tools**: `read`, `search`, `edit`, `grep`, `agent`

## When to use it

When discussing test cases, coverage, component/integration tests, regression tests, test data,
negative/boundary cases or objective pass/fail criteria.

## Required inputs

- Approved requirements/acceptance criteria and design.
- The implementation under test and supported test environment.
- Project test strategy and required coverage/gates.

## Expected outputs

- Test cases derived from requirements/design, not only from code.
- Positive, negative, boundary and error-path coverage.
- Regression tests for corrected defects.
- Reproducible test results and traceability to requirements.

## Limits and independence

- It does not validate the final product.
- Where independence is required, it does not act as independent tester for code it authored as implementer.
