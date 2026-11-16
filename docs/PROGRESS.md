## BC-017 — Eliminar e indexar archivos desde Gestión histórica (2026-11-16)
- Implementación propuesta: eliminación confirmada del original actual en S3 y registro MySQL `archive_documents`, con borrado en cascada de `archive_pages`; reindexación manual asíncrona para PDF anuales reconocidos, usando la Lambda ingesta existente.
- PDFs de otras publicaciones siguen requiriendo catalogación; no se muestra un botón de indexación engañoso.
- Requiere provisioning explícito: backend IAM `s3:DeleteObject`, `lambda:InvokeFunction` sobre ingestor y autorización del endpoint privado de Lambda, además de prueba end-to-end. La eliminación no purga versiones previas S3, que se conservan para recuperación conforme a política de retención.
- Se han añadido controles de concurrencia por VersionId y auditoría de solicitud/borrado en admin_audit_logs. TRACE-GAP: prueba real de carreras de ingesta/borrado, retención de auditoría, reconciliación S3/MySQL, revisión independiente FULL y despliegue verificado. No fusionar/desplegar hasta cerrar los gates.

## BC-008/BC-011 y BC-002/BC-017 — Incidencia de versiones en AWS (2026-11-16)
- Capturas en producción: indicador de paginación NaN–NaN/undefined, cambio de 10 a 20/50 sin efecto, mensaje para iniciar sesión pese a usuario autenticado y HTTP 403 en Gestión histórica como administrador.
- AWS Lambda `boscochat-backend` reportaba `LastModified=2026-11-13T16:58:45Z` mientras Amplify main se había actualizado el 2026-11-16. Causa primaria confirmada: frontend actualizado con backend antiguo.
- Corrección propuesta: frontend valida estrictamente el contrato paginado y evita datos engañosos; mensaje de autenticación condicionado a ausencia real de sesión; backend añade marcador de versión y el cambio en backend dispara el workflow de despliegue al fusionar en main.
- TRACE-GAP: comprobar workflow push main + Lambda LastModified, respuesta pública paginada real 10/20/50, prueba autenticada del administrador sobre S3 y revisión independiente de seguridad. No marcar DONE ni declarar despliegue antes de verificarlos.

## BC-002 / BC-017 — Decisión de administrador con permisos completos (2026-11-13)
- El propietario autoriza expresamente que `administrator` tenga todos los permisos funcionales de la plataforma, incluidos los de `documentary_manager` en Gestión histórica, manteniendo la separación de permisos de cuentas para historiadores y usuarios normales.
- Implementación propuesta en PR: ampliar control de acceso backend y navegación frontend; actualizar pruebas de lectura, subida, descarga y denegación a usuarios sin privilegios.
- TRACE-GAP: CI, revisión independiente de autorización y validación autenticada en AWS/Amplify. No se considera desplegado ni DONE antes de estos controles.
## BC-008 / BC-011 — Paginación de resultados (2026-11-16)
- Decisión del propietario: eliminar el límite global de diez coincidencias; mostrar diez por página por defecto, selector 10/20/50 y botones Anterior/Siguiente.
- Implementación propuesta: consultas MySQL paginadas con total de coincidencias, orden estable y validación de parámetros; React conserva filtros y búsqueda enviada durante la navegación.
- Pendientes: CI, revisión independiente, prueba real con múltiples páginas y verificación de rendimiento en corpus representativo. No marcar DONE ni afirmar despliegue.

## BC-002 — Frontend admin 401 / first-party API proxy (2026-11-13)
- Owner screenshot: role `administrator` visible in navigation, yet loading `/api/admin/users` returned `AUTHENTICATION_REQUIRED` (401), suggesting that the previously cross-site `execute-api` cookie was not available on subsequent requests. Historiador-only `Gestión histórica` correctly remains invisible to Administrador by design.
- PR #49 merged (`6763f689e80edf8a59806e02245846cd375b7f8f`), frontend/CI successful. Frontend API clients now default to first-party `/api`; existing-user role selector correctly renders the three labels instead of object values. Backend sends `Cache-Control: private, no-store` for every API response.
- AWS Amplify app `dyqpe5eifx600` now has priority HTTPS reverse-proxy rewrite `/api/<*>` to `https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api/<*>` before the SPA fallback; cacheConfig changed to cookie-aware `AMPLIFY_MANAGED`, environment `VITE_API_URL=/api`. After merge, Amplify `main` job #46 `SUCCEED`, explicit environment-rebuild #47 `SUCCEED`.
- Postdeploy backend smoke (without session): `GET /api/auth/session` 401, `GET /api/admin/users` 401, `GET /api/admin/historical/documents` 401, public search 200; every endpoint has `Cache-Control: private, no-store`. Authenticated browser must log out/re-login to establish new host-only first-party cookie; **positive Admin list and Historian PDF directory requests are still awaiting user/browser confirmation**. Do not mark BC-002/BC-017 DONE until positive end-to-end tests and independent security review.

## BC-017 — Directorio de PDF / actualización de subida (2026-11-13)
- El propietario confirma mediante capturas que su navegador presenta una pantalla antigua «Panel de Gestión Documental» con campos OCR manual y que Administración de usuarios muestra «Failed to fetch». `main` ya tenía el componente `HistoricalManagement.jsx`, pero se verifica que Amplify marcó como exitosos los despliegues recientes. Pendiente comprobar caché/pestaña antigua en dispositivo real.
- La API Gateway HTTP `i40yd4xj1k` tenía CORS limitado a GET/POST/OPTIONS. Se ha ampliado a GET/POST/PATCH/DELETE/OPTIONS con credenciales y los tres orígenes HTTPS autorizados, sin permitir `*`; necesario para administración de usuarios.
- Rama `fix/bc-017-directory-pdf-upload-20261113`: directorio privado de S3 como pantalla principal, subida diferenciada, filtro por nombre, estado de indexación y descarga con nombre original. Se admiten PDF de otras publicaciones con nombre de archivo seguro en `originals/`, sin sobrescribir; se distinguen `indexed`, `pending` (anualidad conocida) y `stored` (otras publicaciones que aún requieren catalogación). Solo `documentary_manager` accede a estas operaciones.
- **Pendientes:** CI/PR/merge y despliegue Amplify; comprobar recarga real del navegador y pruebas positivas de subida/descarga con usuario historiador. No afirmar que un PDF arbitrario está indexado: la ingesta actual solo reconoce `Don Bosco en España_YYYY.pdf`. Revisión independiente de seguridad para contenido no confiable y antimalware sigue abierta.

## BC-002 three-profile RBAC and admin-issued password reset (2026-11-13)
- Product owner defined three visible profiles: Administrador de plataforma, Historiador and Usuario. Branch implements admin-only account management and password reset, historian-only archive management, normal-user search, role assignment limited to three, with legacy paid-plan roles preserved for existing accounts.
- Password reset has 20-minute one-time hashed token, authenticated admin issuance and transactional session revocation. Schema migration and PASSWORD_RESET_ENABLED/VITE_PASSWORD_RESET flags are gated OFF pending MySQL migration and independent FULL security verification. BC-002 remains BLOCKED.

# BoscoChat Progress

## BC-017 — PDF directory deployment evidence (2026-11-13)
- PR #47 merged into `main` at `5615e6d42cf3e181e6156afa2ddc73a982dd956f`; backend/frontend/MySQL and PDF-worker CI passed. Amplify `main` job #44 `SUCCEED` for this commit; backend Lambda updated successfully. The signed S3 upload/download UI now presents the private PDF directory first, and a separate «+ Subir nuevo PDF» action.
- S3 `originals/` still contains 92 annual historical PDF originals plus a zero-length folder marker; no existing originals were overwritten. Generic safe PDF names can be stored in this directory, status `stored`, awaiting cataloguing; only recognized `Don Bosco en España_YYYY.pdf` annuals are automatically indexed. Ingestor SQS event filter now acknowledges safe nonannual PDF event notifications without DLQ retries.
- CloudFormation stack `boscochat-archive-ingestion` `UPDATE_COMPLETE`: `boscochat-pdf-ingestor` image pinned at `sha256:5a4081334a8b101054bcc2c08c56c933508dea52ee0acc4e1f26abbe03c6c81f` (prior image tag `sha-fa73a54eb76977499be773ce13f9515a413e4246` retained as rollback reference). Other stack parameters preserved. SQS ingestion and DLQ both at zero pending and in-flight.
- AWS HTTP API CORS updated from GET/POST/OPTIONS to GET/POST/PATCH/DELETE/OPTIONS; credentials and existing three trusted HTTPS origins retained. This addresses missing preflight methods for user administration but browser `Failed to fetch` has not yet been confirmed resolved on the owner's device.
- **Open verification:** screenshot had stale client bundle («Gestionar archivo» and OCR text form) despite GitHub `main` containing new component. Owner should reload web app with cache bypass and sign in as `Historiador` (admin account alone has no access). End-to-end authenticated directory and PDF upload/download still need confirmation. No real original was uploaded as a synthetic test. Independent security/anti-malware review and generic-PDF automatic indexing/cataloguing remain pending.


## BC-002/BC-017 deployment verification — 2026-11-13
- PR #41 (Gestión histórica) and PR #42 (three access profiles) merged in `main`; frontend correct historian-only copy PR #43 merged. Product access roles: `administrator` (account management), `documentary_manager` (historical archive management) and `free` (ordinary search). Legacy plan roles preserved.
- Applied backend-role inline policy `BoscoChatHistoricalManagementS3` (S3 list prefix `originals/*`, read/upload originals) and S3 CORS for HTTPS `boscochat.com`, `www.boscochat.com` and Amplify default origin, PUT only. Bucket Public Access Block remained fully enabled. Amplify deployment job #40 succeeded after setting `VITE_HISTORICAL_MANAGEMENT=true`; backend `HISTORICAL_MANAGEMENT_ENABLED=true`. Following jobs #41/#42 also succeeded.
- Lambda snapshot version 4 saved before exposing historical management. Post-activation smoke: anonymous/invalid-session management HTTP 401, archive search HTTP 200 with 10 results. **No authorized historian browser smoke yet**; IAM signed PUT, private download and concurrent non-overwrite require browser/integration confirmation and independent cybersecurity review. BC-017 is deployed for validation, not DONE.
- PR #44 merged for one-off password reset schema bootstrap. Lambda snapshot version 5 saved; CloudWatch explicitly recorded `Password reset token schema bootstrap completed` and health HTTP 200. Temporary `PASSWORD_RESET_SCHEMA_BOOTSTRAP` flag removed after success. `PASSWORD_RESET_ENABLED` and `VITE_PASSWORD_RESET` remain off pending independent auth review and test with authorized administrative actor, token single-use/expiry, and session revocation. Do not mark BC-002 DONE.


## BC-017 Gestión histórica — implementación en revisión (2026-11-13)
- El propietario define el nombre visible «Gestión histórica». Rama `feat/bc-017-gestion-historica-20261113`: acceso exclusivo para `documentary_manager` (Historiador), inventario privado S3 con filtro y estado RDS, subida PUT condicionada firmada de PDF anuales hasta 350 MiB con indexación S3→EventBridge→SQS, y descarga original mediante enlace firmado de 60 s. Se sustituye el formulario antiguo de OCR de prueba.
- Limitación de alcance: por ahora solo anualidades `Don Bosco en España_YYYY.pdf`, dado que el worker actual no reconoce otras publicaciones. Catalogación de otras revistas, campos de autor/sección y corrección OCR quedan `TRACE-GAP`.
- No marcar DONE ni desplegar IAM/CORS sin CI e independiente revisión de seguridad, prueba real de S3 y comprobación de sobrescrituras/riesgos de concurrencia.


## BC-012 visual page 15-second timeout remediation — 2026-11-13
- Owner browser screenshot showed original-page image fetch failure on 2025 p12 after login. Backend CloudWatch confirmed a 15000 ms Lambda timeout during the page-image path.
- Root cause: `boscochat-backend` VPC had S3 gateway endpoint but no NAT or Lambda API interface endpoint. The backend's `lambda:InvokeFunction` SDK call to private image renderer could not reach Lambda API. This was **not** a failure of `pdftoppm` (direct renderer tests had succeeded).
- PR #38 merged, CloudFormation stack `boscochat-private-lambda-endpoint` in `CREATE_COMPLETE`; interface endpoint `vpce-0fb8b8294057b3182` is `available`, private DNS enabled, spans both existing backend subnets. HTTPS 443 security group ingress permits only the backend execution security group; VPC endpoint policy permits invoke only `boscochat-pdf-page-renderer`.
- **Pending evidence:** repeat authentic user opening `Don Bosco en España (2025)` p12 to confirm end-to-end image returns successfully. Do not mark BC-012 DONE until this, independent security review and watermark durability are resolved. New interface endpoint incurs hourly and per-GB charges.


## BC-012 protected visual page preview — AWS deployment evidence, 2026-11-13
- PR #35 was merged to `main` (commit `f228d83ac1788572bba49c81aeec83d29765267d`), and CI package, frontend and PDF-worker build checks passed.
- AWS CloudFormation stack `boscochat-archive-page-renderer` reached `CREATE_COMPLETE`; PR #36 repaired the narrowly scoped S3 `previews/*` cache-miss listing permission, and the stack reached `UPDATE_COMPLETE`.
- Container in private ECR: immutable `sha256:5e371c207b1a0ecf466880c03578d142d8867f09c60ef4c27de1fc7c15265717`; the original ingestor Lambda image and SQS mappings were not modified.
- Direct production Lambda tests rendered actual physical JPEG pages: 1923 p18/p92, 2025 p1, 1994 p1. 1923 p18 private cached JPEG: 236426 bytes. One original was 263 MiB; representative initial renders observed in CloudWatch at roughly 2–5 seconds.
- Backend Lambda role `boscochat-backend-role-yvarjgvz` received `lambda:InvokeFunction` ONLY for `boscochat-pdf-page-renderer`; a dedicated watermark HMAC secret was generated privately; `ARCHIVE_PAGE_IMAGE_ENABLED=true`. A rollback version `boscochat-backend:3` was published before activation. PDF byte-range proxy remains disabled.
- Backend Lambda tests: anonymous image request = HTTP 401, invalid session = HTTP 401, public archive keyword search = HTTP 200 (10 results). These do NOT substitute for an authenticated positive browser image test.
- Amplify app `dyqpe5eifx600`, branch `main`, job #33 `SUCCEED`. App variables `VITE_ARCHIVE_PAGE_IMAGE=true` and `VITE_ARCHIVE_PDF_VIEW=false`. Public `https://boscochat.com` is configured to display original page JPGs for authenticated users; **browser end-to-end still to be confirmed by owner**.
- Status: **DEPLOYED FOR USER VALIDATION; BC-012 NOT DONE**. Independent FULL security review, robust/invisible watermark durability (JPEG COM marker is easily removed), session-positive browser test, rate abuse, cross-browser cookies, accessibility and rollback test remain `TRACE-GAP`. Do not confuse producer smoke tests with independent verification.


## BC-012 protected visual page preview implementation — 2026-11-13
- Owner requested source-page **visual** reading, not raw OCR. Branch `feat/bc-012-rendered-page-previews-20261113` adds an isolated Poppler JPEG renderer, private S3 cache, authenticated image endpoint, preliminary per-user trace metadata, throttling, React page navigation/zoom and tests. All release switches default off; production and independent FULL security tests are still required before activating.
- The historical PDF proxy remains disabled; images do not expose full private originals. Robust watermarking, large-document performance and browser end-to-end verification remain TRACE-GAP.


## BC-008/BC-011 relevance search and BC-012 visual PDF gap — 2026-11-13
- User confirmed live keyword search works but multi-word queries enforce all terms, show only OCR text, and do not open the visual source page. Implemented relevance-ranked default, all/any/exact search modes, contextual highlighted snippets in branch `feat/bc-008-natural-search-and-visual-viewer-prep-20261113` (tests/CI/release pending).
- BC-012 remains **BLOCKED**: range proxy is feature-gated and not independently verified for authenticated browser PDF loading, cross-origin cookies, large file ranges, controls, watermark, and rate abuse. Do not enable raw PDF viewing from this change; needs separate verified viewer delivery.


## BC-008 public search activation preparation — 2026-11-13
- Owner explicitly requested activation of ten-result anonymous archive previews on `boscochat.com`, overriding the former unauthenticated-search prohibition as a product request; RF-USER-03 approved SRS update still needed (TRACE-GAP).
- Branch `feat/bc-008-public-search-guarded-activation-20261113` adds MySQL-backed per-IP limiting (30/minute, fail-closed), tests, no-cache responses and AWS activation checklist. No live deployment is evidenced; do not mark BC-008 DONE or enable public search prior to required independent review.
- Last owner-observed archive MySQL count: 41 indexed annual documents out of 92 enqueued; remaining ingestion completion unverified.


## Current focus
- BC-002 — PR #17 merged to `main` on 2026-11-10 with the shared MySQL/HMAC authentication limiter and passing producer CI, but with zero submitted reviews and while its recorded gate said `BLOCKED / TRACE-GAP — do not merge`. The story remains `BLOCKED`.
- BC-003 — Query usage logging and quotas remains `BLOCKED` after merge pending independent gates and policy approval.
- BC-006 — PR #17–#21 and #23 placed catalog hashes, AWS planning evidence, annual-key parsing, a disabled S3 probe, archive schema/import/search components and a disabled PDF proxy on `main`. No real Lambda `GetObject`, archive migration, ingestion, representative AWS read or independent FULL review is evidenced; BC-006 remains `BLOCKED`.
- BC-007, BC-008, BC-009 and BC-012 — Partial product artifacts were merged in PR #20/#23 but remain disabled by default or unexecuted. Their completion and activation are blocked by dependencies, representative environment evidence, independent review and, for anonymous search, an SRS baseline conflict.

## Product requests recorded 2026-11-13
- BC-016 (IDEA/P1): official domain and HTTPS; exact hostname, DNS access, API subdomain and certificate arrangement to confirm before deployment.
- BC-017 (IDEA/P1): admin/manager document upload, private listing, filename filter and authorized original download; integrate with S3-driven automatic ingestion. Requirements and privacy/authorization gates pending.
- BC-007: implementation branch for event-driven S3 -> SQS -> worker indexing, not deployed in AWS and not DONE.

## In progress
- PR #24 is open as a draft documentation-only reconciliation of the externally merged PR #17–#21 and #23 artifacts. It is mergeable and conflict-free, but remains `BLOCKED / TRACE-GAP` until an independent reviewer verifies the exact head.

## Blocked
- BC-002 — Required: representative staging/distributed-load validation; distinct independent FULL security and functional review; deployment provisioning for `AUTH_RATE_LIMIT_HMAC_KEY`; approved access/retention/deletion policy for `admin_audit_logs`.
- BC-003 — Required: independent functional verification, independent FULL security confirmation of the CWE-400 remediation in `c74dce1`, and explicit approval or exception acceptance for production quota/reset values and query-log retention.
- BC-006 — Required: approved storage/encryption/privacy baseline; independently verified S3/KMS/IAM/backend/IaC deployment; positive and negative AWS access tests; real Lambda document read; retention/antimalware/audit/RPO-RTO decisions; independent FULL review. Owner-supplied screenshots indicate S3 with SSE-S3, while the proposal still requires SSE-KMS.
- BC-007 — Parser, schema and one-PDF importer exist, but archive migration/ingestion has not run in a representative AWS/RDS environment. Upload authorization, retry/diagnostics, OCR correction and correction audit trail remain unevidenced.
- BC-008 — Word-search/annual-filter preview code exists behind disabled flags, but no real indexed corpus, performance proof, exact-phrase/AND/OR coverage, public anti-abuse control or independent review exists. Anonymous execution conflicts with RF-USER-03.
- BC-009 — The merged flow retains a selected document/page through login, not the entered query required by RF-USER-03; anonymous execution conflicts with the approved baseline.
- BC-012 — Page-text retrieval and a PDF range-proxy prototype exist behind disabled flags; real S3/API Gateway behavior, cookies/CSP, large-PDF handling, per-user range-request abuse/cost controls, source-page navigation and watermarking remain unverified.
- Production release/deployment only: rotate or revoke the database credential previously committed to Git history and validate backup/restore plus the authentication migration on representative staging data. Per project-owner direction on 2026-09-15, this operational action is deferred and does not block unrelated development stories.

## Ready but not executable
- BC-004 depends on BC-003, which is not `DONE`.
- BC-010 has only a partial annual filter and depends on blocked BC-008.
- BC-011 has only a partial result preview and depends on blocked BC-008 plus incomplete BC-010.
- No `READY` story is currently executable.

## In review
- PR #24 — Draft documentation reconciliation. No workflow applies to its documentation-only diff; independent review on the exact head is pending. Merged artifacts with unsatisfied gates remain `BLOCKED`, not `DONE`.

## Product / requirements review
- PR #20 records an owner-conversation claim that archive discovery should be anonymous and return at most ten previews. This conflicts with RF-USER-03 and BC-008/BC-009, which prohibit unauthenticated search execution. Treat the behavior as `TRACE-GAP` and keep it disabled until the approved SRS/backlog baseline is reconciled.
- BC-014 — User profile management and BC-015 — Email verification/controlled email change remain separate non-executable `IDEA` stories with measurable criteria and `TRACE-GAP`.

## Recently merged artifacts
- PR #17 — Merged 2026-11-10 with passing producer workflows, zero submitted reviews and an explicit blocking gate. Remediations and catalog hashes are on `main`; BC-002 and BC-006 remain blocked.
- PR #18 — Documentation-only AWS/S3 plan and owner-supplied console observations; merged with no workflow or submitted review.
- PR #19 — Annual archive-key parser only; producer CI passed, no submitted review.
- PR #20 — Archive schema/import/search/viewer modules and frontend prototype; producer CI passed, no submitted review. Migration, ingestion and AWS deployment were not executed; feature flags remain off.
- PR #21 — Disabled-by-default administrator S3 header probe; producer CI passed, no submitted review and no real probe result.
- PR #22 — Closed without merge as superseded.
- PR #23 — Mounted archive search/document routes into the current backend and retained disabled flags; producer CI passed, no submitted review.

## Recently completed
- AWS MVP authentication runtime validated end-to-end on 2026-09-15: Amplify frontend, API Gateway HTTP API, Lambda/Express via Lambda Web Adapter, private RDS MySQL, verified RDS TLS, exact-origin CORS, registration, login, persisted session/reload and logout. Architecture and deployment evidence were documented in PR #8 and merged to `main`.
- BC-001 — User registration and authentication. PR #4 merged on 2026-09-14. Independent code/functional verification and FULL source-based security review recorded in PR #5. Acceptance criteria pass; release constraints remain listed separately above.
