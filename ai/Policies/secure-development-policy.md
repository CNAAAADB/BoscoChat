# Secure development policy

- Validate untrusted input at trust boundaries and encode output for its destination context.
- Enforce authorization server-side at each protected resource/action.
- Use parameterized database APIs and structured process invocation.
- Store credentials in approved secret managers or protected runtime configuration.
- Use maintained dependencies and reproducible lockfiles/builds where supported.
- Default network/cloud resources to private and permissions to least privilege.
- Log security-relevant events without logging credentials or sensitive payloads.
- Add a regression test for each security defect when the behavior can be tested.
- Review threat/abuse cases before implementing high-risk features.
