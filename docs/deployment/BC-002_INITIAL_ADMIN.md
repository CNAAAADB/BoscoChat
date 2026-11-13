# BC-002 — Initial platform administrator recovery (2026-11-13)

## Why
The owner reports there is no initial platform administrator available to create privileged users. Public signup must not allow self-selecting privileged roles.

## Controlled bootstrap
- Backend boot runs `ensureInitialAdministrator(pool, INITIAL_ADMIN_EMAIL)` only when `INITIAL_ADMIN_BOOTSTRAP=true` is temporarily set on the production Lambda. The target email is supplied **only in AWS runtime configuration** and must never be committed, printed or copied to audit metadata.
- The transaction locks the existing active administrator rows and selected user row. It changes only that pre-existing active account's `role` to `administrator` when zero active administrator accounts exist. Missing or suspended accounts and existing active admins cause no changes.
- The new administrator's password hash, email, name, sessions and any archive data remain unchanged. A database admin-audit entry is created in the same transaction with action `bootstrap.admin.initial`.
- The flag and email are removed from Lambda configuration after confirming a `promoted` result in CloudWatch; future role assignment occurs only through admin-only APIs.
- Any error rolls back; server remains available and reports only a safe status. An independent privileged access and identity verification is still required after provisioning.

## Guardrails
Never enable the bootstrap on an arbitrary branch, never select a user by username alone, and do not assign the administrator role based on an unauthenticated API request. Confirm the owner's existing account identity and the absence of an active administrator beforehand. Avoid logging the target address. The bootstrap must be one-time and flagged OFF afterward.

## Verification
- Producer tests: zero administrators, missing/suspended account, existing administrator, transaction rollback, audit.
- Production: AWS Lambda CloudWatch `Initial administrator bootstrap: promoted`, inspect flag cleanup and healthy search, ask owner to sign out/back in and confirm the **Administrar usuarios** navigation is present.
- If deployment checks or independent security review are missing, retain `TRACE-GAP`; do not mark BC-002 DONE.
