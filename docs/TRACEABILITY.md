## Brand — nombre, favicon y logo de BoscoChat (2026-11-18)
- Solicitud explícita del propietario y fichero original aportado en el chat: `Favicon BoscoChat con retrato(1).png`.
- Implementación: `frontend/index.html` (`lang=es`, título `BoscoChat`, favicon cache-busted, metadatos), `frontend/public/favicon.svg` (marca oficial autocontenida), `frontend/src/App.jsx` (nombre visible `BoscoChat` y logo de la marca en la portada con texto alternativo y dimensiones estables).
- TRACE-GAP: confirmar visualmente favicon y portada en distintos navegadores después de la fusión y despliegue.

## BC-017 — Evidencia real de reparación de MySQL (2026-11-16)
- Fallo: CloudWatch `DELETE /api/admin/historical/documents` `ER_NO_SUCH_TABLE (42S02)`; diagnóstico `inspect-archive-schema` identificó exclusivamente `admin_audit_logs` ausente.
- Respaldo: snapshot cifrado `boscochat-pre-audit-repair-20261116` AVAILABLE. Operación `repair-archive-audit-schema` verificada sin alterar otras tablas; inspección posterior reportó `missing=[]`. Lambda privada temporal eliminada.
- PR #61 merge `4d71163ef31894bed609ab3c99c4178e4af095ef`: diagnóstico/repair en `backend/worker/archive-audit-schema.js`, pruebas, aviso y errores por archivo en `frontend/src/HistoricalManagement.jsx`. Amplify main job 58 SUCCEED.
- TRACE-GAP: E2E autenticado con PDF de prueba, procesamiento asíncrono de indexación real y revisión de seguridad independiente siguen pendientes.

## BC-017 — Incidencia funcional, evidencia AWS (2026-11-16)
- CloudWatch 2026-11-16 registra `method: DELETE`, `path: /api/admin/historical/documents`, `code: ER_NO_SUCH_TABLE`, `sqlState: 42S02`. Diagnóstico de tabla específica pendiente de Lambda privada.
- Ruta de diagnóstico/DDL sólo mediante `backend/worker/archive-audit-schema.js` invocable en VPC y nunca expuesta a HTTP; validación en `backend/test/archive-audit-schema.test.js`.
- UX en `frontend/src/HistoricalManagement.jsx` muestra carga y error por documento; no declara indexación terminada al recibir sólo HTTP 202.
- TRACE-GAP: verificación MySQL y E2E segura, no marcar acción como corregida hasta evidencia positiva.

## BC-017 — Incidencia: botón Indexar ausente y eliminación con timeout (2026-11-16)
- Frontend `frontend/src/HistoricalManagement.jsx` añade catalogación de `stored`; API `frontend/src/api/historical.js` envía publicación/año.
- Backend `backend/src/routes/historical-management.js` admite catalogación validada de PDF no anuales; worker `backend/worker/handler.js` acepta metadata sólo en invocaciones manuales autorizadas, manteniendo parser automático de anuarios.
- AWS detectado: Lambda backend timeout 15 s y entradas CloudWatch `Status: timeout`; configuración subida a 28 s (HTTP API IntegrationTimeout 30 s). TRACE-GAP: confirmar ruta del timeout con observabilidad adicional y verificar el borrado de un PDF sintético, nunca original real.
- Pruebas en `backend/test/historical-management.test.js`, `backend/test/ingestion-worker.test.js`; CI y seguridad pendientes.

## BC-017 — Activación operativa de controles (2026-11-16)
- PR #57 fusionado; `frontend/src/HistoricalManagement.jsx` muestra botón de la acción inversa según estado; `backend/src/routes/historical-management.js` implementa desindexación sin borrar original S3, preservando fila documental e invalidando páginas de búsqueda.
- AWS: `boscochat-pdf-ingestor` actualizado por CloudFormation; funciones backend protegidas activadas, frontend desplegado mediante Amplify main job 55 SUCCEED; IAM limitado y verificado.
- TRACE-GAP: aprobación independiente de la revisión de seguridad, pruebas E2E con documento sintético y revisión de consistencia ante fallos parciales SQL/S3. Estado de historia sin elevar automáticamente a DONE.

## BC-017 — Indexar/desindexar según estado (2026-11-16)
- Backend: `backend/src/routes/historical-management.js` añade desindexación no destructiva del S3, protegida por rol y marca de versión; `backend/src/app.js` configura flag.
- Frontend: `frontend/src/HistoricalManagement.jsx`, `frontend/src/api/historical.js` presentan la acción inversa del estado.
- TRACE-GAP: validación E2E y concurrencia SQS/S3, revisión de seguridad independiente; no marcar DONE.

## BC-017 — Evidencia de aplicación real de esquema MySQL (2026-11-16)
- PR #55: definición aditiva compartida `backend/src/db/archive-migration.js`, ejecutor en VPC `backend/worker/archive-migration.js` y pruebas de compatibilidad.
- RDS `boscochat-db` privado, snapshot cifrado `boscochat-pre-bc017-index-delete-20261116` AVAILABLE.
- Invocación real de Lambda privada: `status=verified`, tablas `archive_deleted_sources` y `archive_manual_index_requests` verificadas y FK de `archive_pages` `ON DELETE CASCADE` verificada. Función de migración eliminada después de ejecutarse.
- Persisten TRACE-GAP operativos para activar BC-017: IAM de borrado e invocación de ingestor, actualización de contenedor y pruebas funcionales/seguridad. No confundir esquema aplicado con funcionalidad habilitada.

## BC-017 — Migración privada RDS (2026-11-16)
- Snapshot cifrado AVAILABLE `boscochat-pre-bc017-index-delete-20261116` antes de DDL. Instancia RDS MySQL 8.4.9 privada.
- Definición aditiva común: `backend/src/db/archive-migration.js`; ejecutor en VPC: `backend/worker/archive-migration.js`; CLI compatible: `backend/scripts/migrate-archive.js`; pruebas: `backend/test/archive-migration.test.js`.
- TRACE-GAP: ejecutar la migración real y verificar columnas, índices y `archive_pages` CASCADE. Mantener flags destructivas desactivadas hasta cerrar este control.

## BC-017 — Eliminar e indexar PDF (2026-11-16)
- Alcance: borrado confirmado del original visible en S3 y filas de MySQL de documento y páginas en cascada; petición asíncrona de indexación mediante Lambda existente para anualidades reconocidas.
- Código: `backend/src/routes/historical-management.js`, `backend/worker/handler.js`, `frontend/src/api/historical.js`, `frontend/src/HistoricalManagement.jsx`; pruebas en `backend/test/historical-management.test.js`.
- TRACE-GAP: pruebas con S3 versionado y RDS, IAM/VPC endpoint de Lambda, riesgos de carrera de ingesta/borrado, seguridad independiente y política de auditoría/retención.
 
## BC-008/BC-011/BC-002/BC-017 — Desfase frontend/Lambda (2026-11-16)
- Evidencia usuario: NaN/undefined en paginación y 403 de Gestión histórica con administrador. AWS `GetFunction` comprobó `boscochat-backend` sin actualizar desde 2026-11-13 frente a Amplify actualizado 2026-11-16.
- Cambios: `frontend/src/App.jsx` valida el contrato y condiciona el texto de login; `backend/src/routes/archive-search.js` añade marcador del contrato; `backend/test/archive-public-access.test.js` verifica dicho marcador.
- TRACE-GAP: completar CI, merge, despliegue Lambda y smoke de búsqueda paginada, más acceso positivo de administrador en navegador y revisión independiente.

## BC-008 / BC-011 — Resultados paginados (2026-11-16)
- Decisión de producto: diez por página de forma predeterminada; 10/20/50 seleccionables, contador total y navegación sin límite fijo de diez coincidencias globales.
- Código propuesto: `backend/src/documents/archive-search.js`, `backend/src/routes/archive-search.js`, `frontend/src/App.jsx`; pruebas `backend/test/archive-search.test.js`.
- TRACE-GAP: CI, independiente FULL review y ejecución AWS/usuario autenticado con corpus y medición de latencia.

# BoscoChat Traceability

Traceability is maintained from SRS requirement -> backlog story -> design -> implementation -> tests -> PR -> independent verification/security evidence.

Use `TRACE-GAP` where required evidence is missing. Do not infer links that are not evidenced by repository artifacts or PR history.

## Requirement to backlog mapping

| SRS requirement(s) | Story |
|---|---|
| RF-USER-01, RF-USER-02, RNF-SEC-01, RNF-SEC-03 | BC-001 |
| RF-USER-04, RF-ADMIN-01, RNF-SEC-03 | BC-002 |
| RF-USAGE-01, RF-USAGE-02, RF-USAGE-03 | BC-003 |
| RF-SUB-01, RF-SUB-02, RF-ADMIN-02 | BC-004 |
| RF-PAY-01, RF-PAY-02, RF-SUB-02 | BC-005 |
| RF-DOC-04, RF-DOCMGMT-01, RNF-SEC-02, RNF-SCALE-02, RNF-MAINT-01 | BC-006 |
| RF-DOCMGMT-01, RF-DOCMGMT-02, RF-DOCMGMT-04 | BC-007 |
| RF-SEARCH-01, RF-SEARCH-02, RF-SEARCH-03, RF-SEARCH-04, RNF-PERF-01 | BC-008 |
| RF-USER-03 | BC-009 |
| RF-SEARCH-05, RF-SEARCH-06, RF-SEARCH-07, RF-SEARCH-08, RF-SEARCH-09 | BC-010 |
| RF-SEARCH-10, RF-SEARCH-11, RF-SEARCH-12, RNF-USE-02 | BC-011 |
| RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04, RNF-SEC-02 | BC-012 |
| RF-ADMIN-03 | BC-013 |
| TRACE-GAP — proposed scope; product-owner and SRS-baseline approval pending | BC-014 |
| TRACE-GAP — proposed scope; product-owner and SRS-baseline approval pending | BC-015 |
| RF-CHAT-01, RF-CHAT-02, RF-CHAT-03, RF-CHAT-06, RNF-USE-02 
| BC-016 | TRACE-GAP: official domain request, hostname/DNS pending | DNS/Amplify/API custom hostname planned | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-017 | RF-DOCMGMT-01/02/04; TRACE-GAP on exact permissions | Authorized S3 management UI/API planned | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-101 |
| RF-RAG-01, RF-RAG-02, RF-RAG-05, RNF-PERF-02 | BC-102 |
| RF-RAG-03, RF-RAG-04, RF-CHAT-07 | BC-103 |
| RF-CHAT-04, RF-CHAT-05 | BC-104 |
| RF-DOCMGMT-03 | BC-201 |
| RF-ENTITY-01, RF-ENTITY-02 | BC-202 |
| RF-AI-01, RF-AI-03, RNF-DATA-02 | BC-203 |
| RF-AI-02, RF-AI-04, RNF-DATA-02 | BC-204 |

## Cross-cutting requirements

These are not considered complete from a single story and must be evidenced across applicable implementation/release work:

- RNF-PERF-03 — initial web load < 2 seconds.
- RNF-SCALE-01 — 50 initial concurrent users; architecture permits growth to 1,000-2,000.
- RNF-AVAIL-01 — minimum 90% normal-period availability.
- RNF-AVAIL-02 — maintenance minimizes user impact.
- RNF-DATA-01 — GDPR compliance.
- RNF-USE-01 — intuitive interface for non-technical users.
- RNF-MAINT-01 / RNF-MAINT-02 — modularity/extensibility.

## Baseline conflicts and active TRACE-GAPs

- PR #20/#23 implement feature-flagged anonymous archive discovery, while RF-USER-03 and the current BC-008/BC-009 criteria prohibit unauthenticated search execution. Product conversation evidence does not replace an approved SRS-baseline change.
- Owner-supplied AWS console observations record SSE-S3, while `docs/proposals/BC-006-private-document-storage.md` proposes mandatory SSE-KMS. No approved decision reconciles the two.
- No merged artifact supplies independent review, real archive ingestion, a successful Lambda S3 read, representative end-to-end search/view evidence or watermark verification.

## BC-012 AWS deployment evidence (2026-11-13)
- **Code:** PR #35; `backend/worker/page-preview.js`, `backend/src/routes/archive-documents.js`, `backend/src/documents/jpeg-watermark.js`, `frontend/src/App.jsx`, `infra/archive-page-renderer.yaml`; IAM correction PR #36.
- **Tests:** producer CI passed for PR #35. Isolated Lambda successfully rendered original archive pages 1923 p18/p92, 2025 p1 and 1994 p1 as JPEG. Private S3 image cache and immutable ECR image verified. Anonymous/invalid-session image HTTP 401; public search HTTP 200. Amplify release job #33 succeeded with `VITE_ARCHIVE_PAGE_IMAGE=true`; backend `ARCHIVE_PAGE_IMAGE_ENABLED=true`; raw PDF proxy remains disabled.
- **TRACE-GAP:** no authenticated positive browser test, independent FULL cybersecurity review, robust invisible watermark (JPEG COM marker can be stripped), or concurrent-load/abuse evidence. Status: **deployed for validation**, not DONE.

## BC-002 / BC-017 — Ampliación de autorización del administrador (2026-11-13)
- **Decisión del propietario:** el administrador (`administrator`) hereda las capacidades del historiador (`documentary_manager`) en Gestión histórica; los usuarios `free` y roles comerciales heredados no ganan acceso documental.
- **Código previsto:** `backend/src/routes/historical-management.js` y `frontend/src/App.jsx`; pruebas de regresión en `backend/test/historical-management.test.js`; diseño en `docs/design/BC-002_THREE_PROFILES_AND_PASSWORD_RESET.md`.
- **TRACE-GAP:** CI y revisor independiente FULL de seguridad/autorización, despliegue AWS y navegación positiva real de administrador.

## BC-017 Gestión histórica (2026-11-13)
- **Alcance aprobado por propietario:** nombre «Gestión histórica», acceso para administradores y gestores documentales. `frontend/src/HistoricalManagement.jsx`, `frontend/src/api/historical.js`, `backend/src/routes/historical-management.js`, `backend/src/documents/archive-s3-signing.js`.
- **RF-DOCMGMT-01/02:** listado y consulta RDS, subida directa de PDF anuales autorizada por PUT SigV4 con `If-None-Match`, ingesta automática S3→EventBridge→SQS→Lambda; descarga original separada del visor lector.
- **Pruebas:** `backend/test/historical-management.test.js` cubre control de roles, validación y enlaces firmados. Pendiente CI y pruebas positivas en AWS.
- **TRACE-GAP:** otras publicaciones y metadatos de catalogación, edición OCR/auditoría RF-DOCMGMT-04, anti-malware, simultaneidad al evitar sobrescrituras, revisión de IAM y CORS e independiente FULL de seguridad. BC-017 no DONE.

## Delivery evidence

| Story | Design / Mockup | Code / Components | Tests | PR | Verification | Security | Status |
|---|---|---|---|---|---|---|---|
| BC-001 (`RF-USER-01`, `RF-USER-02`, `RNF-SEC-01`, `RNF-SEC-03`) | DEC-001; no visual mockup required for existing auth forms | `backend/src/auth/`, `backend/src/routes/auth.js`, `backend/src/db/auth-repository.js`, `backend/scripts/migrate.js`, `frontend/src/App.jsx`, `frontend/src/api/auth.js` | `backend/test/password.test.js`, `backend/test/auth.integration.test.js`, `backend/test/config-security.test.js` | #4 (implementation, merged 2026-09-14); #7/#8 (AWS runtime preparation and validated deployment documentation) | PASS: independent code/functional verification 2026-09-15; AWS end-to-end registration/login/session reload/logout validated 2026-09-15; representative staging migration remains a release-only TRACE-GAP | PASS for implementation: FULL source review 2026-09-15; production remains blocked until credential rotation/revocation and staging migration evidence | DONE |
| BC-002 (`RF-USER-04`, `RF-ADMIN-01`, `RNF-SEC-03`) | DEC-001, DEC-004; existing administration UI styling | `backend/src/users/`, `backend/src/middleware/authorization.js`, `backend/src/routes/admin-users.js`, `backend/src/auth/service.js`, `backend/src/db/auth-repository.js`, `backend/src/db/auth-rate-limit-store.js`, `frontend/src/api/users.js`, `frontend/src/App.jsx`, `backend/scripts/migrate.js` | Producer suite PASS on `a62f0dd`; orchestrator privilege/suspension rerun PASS 2026-11-04; PR #17 local 37/37 and producer CI PASS; MySQL 8 migration plus concurrent shared-limiter/last-administrator/session-revocation test PASS | #13 (merged 2026-11-02 while gates remained open); #17 (merged 2026-11-10 despite blocking gate) | Partial PASS: privileges, suspension/session revocation and MySQL 8 producer CI; TRACE-GAP: distinct reviewer plus representative staging/distributed-load validation | HIGH `SEC-BC002-03` and `SEC-BC002-04 / CWE-400` remediation is on `main`; findings remain open until distinct FULL review and representative staging/load verification; HMAC provisioning and audit-log policy pending | BLOCKED |
| BC-003 (`RF-USAGE-01`, `RF-USAGE-02`, `RF-USAGE-03`) | DEC-003 | `backend/src/usage/`, `backend/src/db/usage-repository.js`, `backend/src/routes/legacy.js`, `backend/scripts/migrate.js` | `backend/test/usage.test.js`, updated `backend/test/auth.integration.test.js` | #10 (merged 2026-09-17 while gate was BLOCKED) | Local rerun on remediated head: build/lint PASS, 19/19 tests; TRACE-GAP: independent functional verification of `c74dce1` pending | HIGH CWE-400 storage-amplification path remediated in `c74dce1`; TRACE-GAP: independent FULL confirmation and approved quota/reset plus query-log-retention policy pending | BLOCKED |
| BC-004 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | READY |
| BC-005 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-006 | `docs/proposals/BC-006-private-document-storage.md` (S3 private/SSE-KMS/backend proxy/minimum-privilege proposal); owner-supplied console observations in PR #18/#20 | Source-hash verifier; annual-key parser; disabled S3 probe; archive schema/importer; protected page/PDF proxy prototypes | PR #17 corpus/hash CI PASS; PR #19/#20/#21/#23 producer CI PASS; unit/integration tests use simulated/local providers | #14/#17/#18/#19/#20/#21/#23 merged; #22 closed unmerged | Partial PASS: source hashes and code-level tests; TRACE-GAP: real Lambda `GetObject`, archive migration/ingestion, representative AWS/backend verification and distinct reviewer | TRACE-GAP: SSE-S3 vs SSE-KMS decision, IaC, KMS/IAM negative tests, retention, antimalware, audit, RPO/RTO and independent FULL review | BLOCKED |
| BC-007 | `docs/deployment/S3_ARCHIVE_FIRST_INGESTION.md` | `backend/scripts/migrate-archive.js`, `backend/scripts/ingest-archive-pdf.js`, `backend/src/documents/archive-keys.js`, `backend/src/documents/extracted-pages.js` | Parser/extraction/search producer tests PASS; TRACE-GAP: no representative migration/ingestion run | #19/#20 merged 2026-11-10 | TRACE-GAP: real annual PDF ingestion, upload authorization, retry/diagnostics, OCR correction and audit trail | TRACE-GAP: independent review, worker isolation/IAM/RDS validation and malicious-PDF controls | BLOCKED |
| BC-008 | Feature-flagged frontend flow; no approved design change for anonymous execution | `backend/src/documents/archive-search.js`, `backend/src/routes/archive-search.js`, `frontend/src/App.jsx` | Producer tests cover required plain terms, annual filter and ten-result limit; TRACE-GAP: exact phrase, explicit AND/OR, real corpus and <2s evidence | #20/#23 merged 2026-11-10 | TRACE-GAP: feature disabled, no representative ingestion/query or independent verification; anonymous execution conflicts with RF-USER-03 | TRACE-GAP: distributed public anti-abuse/rate limiting, monitoring, fragment exposure review and independent FULL review | BLOCKED |
| BC-009 | Feature-flagged login handoff | `frontend/src/App.jsx`, authenticated page route | Producer tests cover anonymous preview and authenticated page access | #20/#23 merged 2026-11-10 | TRACE-GAP: selected document/page is retained, not the entered query; no end-to-end verification; anonymous execution conflicts with RF-USER-03 | TRACE-GAP: temporary state/privacy and independent review | BLOCKED |
| BC-010 | TRACE-GAP | Partial annual filter in archive search/frontend | Producer test covers annual filter only | #20 merged 2026-11-10 (partial) | TRACE-GAP: publication, issue, date range, author, section and combination evidence missing | TRACE-GAP | READY |
| BC-011 | TRACE-GAP | Partial ten-result fragment/publication/year/page preview in backend/frontend | Producer preview tests PASS | #20 merged 2026-11-10 (partial) | TRACE-GAP: highlighting, issue/full date, approved UX and representative source links | TRACE-GAP: fragment exposure review | READY |
| BC-012 | TRACE-GAP | Authenticated page-text route plus disabled S3 byte-range PDF proxy and iframe | Producer tests cover authentication and bounded range behavior with simulated providers | #20/#23 merged 2026-11-10 | TRACE-GAP: real S3/API Gateway read, source-page opening, navigation/zoom/scroll, large PDFs, cookies/CSP and independent verification | TRACE-GAP: watermark, capture/download controls, authenticated range-request abuse/cost controls, AWS authorization and independent FULL review | BLOCKED |
| BC-013 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-014 | TRACE-GAP: measurable draft criteria; SRS baseline missing | TRACE-GAP | TRACE-GAP | #17 (documentation only; no implementation) | TRACE-GAP | TRACE-GAP: profile privacy/authorization review pending | IDEA |
| BC-015 | TRACE-GAP: measurable draft criteria; SRS baseline/provider policy missing | TRACE-GAP | TRACE-GAP | #17 (documentation only; no implementation) | TRACE-GAP | TRACE-GAP: token/email security and privacy review pending | IDEA |
| BC-101 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-102 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-103 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-104 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-201 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-202 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-203 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |
| BC-204 | TRACE-GAP | TRACE-GAP | TRACE-GAP | - | TRACE-GAP | TRACE-GAP | IDEA |


