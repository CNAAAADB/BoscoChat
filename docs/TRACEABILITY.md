## BC-107 — Orquestación deliberativa basada en evidencias (2026-11-20)
- Solicitud: equipo de agentes paralelos con crítica y consenso fundamentado tanto para catalogación histórica como para chat. Issue #84 / PR #85.
- Diseño: DEC-006, dos especialistas independientes más crítico y árbitro determinista; sin votos como prueba de verdad, human-in-the-loop obligatorio para publicar cambios documentales.
- Código: `backend/src/agents/evidence-council.js`, `backend/src/documents/document-council.js`, `backend/worker/historical-chat-bedrock.js`, `backend/src/routes/historical-chat.js`, `backend/src/app.js`; UI estado de debate en `frontend/src/HistoricalChat.jsx`.
- Pruebas: `backend/test/evidence-council.test.js`, `backend/test/chat-council-worker.test.js`, `backend/test/historical-chat.test.js` y suite existente. CI pendiente.
- Trazabilidad SRS: RF-RAG-01/02/03/04/05, RF-CHAT-06, RF-DOCMGMT-01/02/03, RNF-PERF-02, RNF-SEC-03, RNF-DATA-01.
- TRACE-GAP: verificación histórica independiente de las afirmaciones (referencias validadas no son inferencias válidas per se), evaluación con corpus etiquetado, costes, latencia, seguridad de OCR adversarial, integración real con #82, pruebas de permisos y revisión independiente. Feature flag OFF.

## BC-102 — Investigador iterativo, fuentes comprobadas (2026-11-20)
- Evidencia: conversación de antiguos alumnos de Cádiz; las preguntas «¿Cuántos presidentes ha tenido?» y «¿Y cuántos menciona la revista?» devolvían referencias a presidentes nacionales o cargos sin relación.
- Código: backend/src/chat/research-agent.js incorpora researchFocus, planResearchQueries, conductHistoricalResearch y revisitCitedSources. Hasta cuatro búsquedas de lectura, ranking contextual, deduplicación y revalidación de páginas previamente citadas contra índice vigente.
- La API recibe sourceTrail validado, sólo IDs/páginas, recupera textos exclusivamente del servidor y conserva barrera administrator, limitación de cuotas y SQL parametrizado. UI: frontend/src/HistoricalChat.jsx aporta trail de citas mostradas.
- Pruebas: backend/test/historical-research-agent.test.js y nuevas regresiones en backend/test/historical-chat.test.js (Cádiz, citas históricas y rechazo de referencias arbitrarias).
- TRACE-GAP: CI, E2E administrador con revistas reales, calidad/recall OCR, verificación independiente de atribuciones y seguridad; sin búsqueda vectorial ni planes de herramientas controlados directamente por LLM.

## BC-101 — Estado de sesión y profundidad documental (2026-11-20)
- Evidencia funcional: usuario confirma acceso a citas PDF, informa pérdida de conversación y respuestas breves aun con modo Investigación.
- `frontend/src/chat-session.js`: carga, persistencia y borrado de historial temporal de la pestaña por ID de administrador, TTL 2 h, tope de 40 mensajes, esquema y controles de aislamiento; `frontend/src/HistoricalChat.jsx`: restablecimiento tras recarga y contexto de cuatro intercambios; `frontend/src/App.jsx`: limpieza al cerrar sesión y conservación durante consulta de PDF.
- `backend/src/chat/historical-chat.js`: historia máxima ocho turnos, longitud máxima de respuesta previa 1.800 caracteres, prompt de Investigación que favorece contenido sustantivo con revistas/páginas y reconoce ausencia de pruebas; `backend/worker/historical-chat-bedrock.js`: hasta 1.900 tokens en Investigación con topes de entrada y salida explícitos.
- Pruebas: `frontend/test/chat-session.test.js`, `backend/test/historical-chat.test.js`, workflow frontend CI actualizado.
- TRACE-GAP: confirmación visual real tras despliegue, privacidad de texto histórico en almacenamiento temporal de navegador compartido, revisión independiente de seguridad/calidad y control de costes/latencia.

## BC-012 — Citas del chatbot a PDF, incidente de contención (2026-11-20)
- Observación usuario: visor Don Bosco en España 1978 página 23 da error al abrir referencia desde Chat histórico.
- Evidencia AWS CloudWatch: 2026-11-20T10:54:46.270Z `GET /api/archive/documents/33/pages/23/image`, `ER_LOCK_DEADLOCK`, `sqlState 40001`; el endpoint falla en middleware de rate limiting, no alcanza el renderizador, cuyos logs carecen de invocaciones relevantes.
- Código: `backend/src/db/auth-rate-limit-store.js` añade reintento acotado sobre transacciones completamente revertidas; `backend/src/app.js` devuelve 503 y Retry-After tras agotar reintentos. Se mantienen límites y denegación por defecto.
- Frontend `frontend/src/App.jsx`: reintento GET sólo en 503; botón contextual «Volver al chat» y estado de conversación conservado cuando se abre una cita.
- Tests `backend/test/archive-rate-limit-deadlock.test.js` y `backend/test/archive-page-image-route.test.js`: regresión de interbloqueo y fallos sin omitir autorización.
- TRACE-GAP: verificación funcional con documento real y análisis de carga del almacén de cuotas tras despliegue.

## BC-101 — Profundidad Investigación predeterminada (2026-11-19)
- Requisito del responsable: respuestas históricas detalladas, con fechas y fuentes de revistas, no siempre breves.
- UI `frontend/src/HistoricalChat.jsx`: selector de profundidad; `research` por defecto.
- API `backend/src/chat/historical-chat.js` valida modo, construye prompt de investigación, eleva cobertura a seis citas desde doce candidatos; `backend/src/routes/historical-chat.js` expone sólo citas [F1]–[F6] realmente citadas y devuelve profundidad aplicada.
- Worker `backend/worker/historical-chat-bedrock.js`: `maxTokens=1300` explícitos para investigación, 650 en los otros modos, límite de respuesta 6500 caracteres.
- Tests `backend/test/historical-chat.test.js`: validación y límites, prompts distintos, selección de fuentes y cita F4.
- TRACE-GAP: revisión independiente de trazabilidad de cada afirmación, calidad y coste/latencia en conversación real.

## BC-102 — Alineación de respuesta con intención del usuario (2026-11-19)
- Evidencia: captura del administrador con respuesta extensa sobre Casa Salesiana de Atocha e indiscriminación de seis citas, algunas sin relación demostrada con la entidad.
- `backend/src/chat/historical-chat.js`: `rankChatSources` exige coincidencia multipalabra para entidades y limita a tres fuentes; `retrieveChatSources` recorta contexto alrededor del hallazgo OCR; `chatPrompt` instruye respuesta concisa, sin confundir topónimo, institución y recuentos exactos.
- `backend/src/routes/historical-chat.js`: las tarjetas de fuentes reflejan sólo identificadores [F1]-[F3] utilizados realmente en la respuesta; se preservan autorización, límites y consultas SQL read-only.
- `backend/test/historical-chat.test.js`: pruebas de referencias tangenciales de Atocha, citas utilizadas, OCR contextual y discurso sin citas.
- TRACE-GAP: validación semántica con fuentes reales/usuario administrador, recuperación vectorial y evaluación independiente de alucinaciones/calidad antes de DONE.

## BC-101/102 — Conversación multi-turno frente a respuestas prefijadas (2026-11-19)
- Requisito de producto validado por feedback: ChatGPT-like en interacción, sin convertir el chatbot en un contador SQL. Se elimina la salida anticipada del API cuando se detecta una petición de conteo o cero resultados.
- `backend/src/chat/historical-chat.js`: `validateChatInput` valida roles alternos y conserva historia contextual de usuario y asistente; `chatPrompt` usa evidencia SQL opcional sin tratar cero coincidencias OCR como ausencia documental; mantiene control de citas.
- `backend/src/routes/historical-chat.js`: la invocación a Bedrock es obligatoria para una respuesta a preguntas válidas, mientras los recuentos literales sirven como contexto; `frontend/src/HistoricalChat.jsx` envía y muestra historial completo y ofrece continuidad.
- `backend/test/historical-chat.test.js`: regresiones de historial, conteos cero y consultas sin evidencia. TRACE-GAP: evaluar comportamiento semántico real y calidad de citas con cuenta administrativa antes de cierre de historias.

## BC-102 — Regresión real de recuento documental (2026-11-19)
- CloudWatch: `Historical chat failed { name: Error, code: INVALID_SEARCH_QUERY }` para un request histórico; la marca temporal es anterior al fix de preguntas largas PR #68.
- `backend/src/chat/historical-chat.js`: normaliza preguntas y añade `countPhraseIntent` + `countIndexedPhrase` sobre MySQL indexed-only, FULLTEXT y parámetros enlazados; `backend/src/routes/historical-chat.js` devuelve recuentos verificables sin LLM, evita cifras al preguntar ambiguamente.
- `backend/test/historical-chat.test.js`: prueba literal de la pregunta proporcionada, conteo multi-documento, negativa de recuentos ambiguos y solo lectura.
- TRACE-GAP: contraste E2E con administrador y SQL real y alcance de variantes OCR antes de cerrar BC-102.

## BC-101/102 — Evidencia de piloto AWS administrador (2026-11-19)
- Implementación: PR #67, tests backend y UI React, feature flags; PR #68 corrige preguntas de más de 12 palabras y 180 caracteres, CI backend/frontend/worker en verde.
- En AWS, `boscochat-bedrock-inference` aislada sin acceso a DB/S3; `BoscoChatBedrockInferenceRole` tiene `bedrock:InvokeModel` en Nova Pro y CloudWatch; el backend sólo `lambda:InvokeFunction` a esa Lambda por VPC endpoint preexistente.
- Evidencia runtime de inferencia con fuente sintética 1925 (Invoke 200, status OK); AWS IAM simulator: inference role S3/RDS implicitDeny, backend InvokeModel implicitDeny.
- Deploy frontend Amplify job #64 SUCCEED y flags admin-only verdaderas; controls 401/403 probados en suite backend, no prueba E2E real de cookie administradora.
- TRACE-GAP para cierre: revisión de seguridad y GDPR independiente, calidad de grounding, performance RAG, y pruebas reales con sesión autorizada. Estado de BC-101/102 IN_REVIEW, sin afirmar verificación independiente.
- Runbook: `docs/deployment/BC-101_ADMIN_CHAT_ROLLOUT.md`.

## Nota de despliegue BC-102 (2026-11-19)
- El acceso a Bedrock exige un rol IAM exclusivo del worker, sin permisos de datos, y autorización mínima en el VPC endpoint privado de Lambda. No crear endpoint Bedrock de pago mientras esta solución sea válida.

## BC-101/102 — Primer chatbot administrador con RAG sobre archivo existente (2026-11-19)
- RF-CHAT-01/02/03/06: `frontend/src/HistoricalChat.jsx`, `frontend/src/App.jsx` con navegación administradora y flag frontend.
- RF-USER-04 / RNF-SEC-03: `backend/src/routes/historical-chat.js` exige sesión real y rol `administrator` en backend, con flag OFF por defecto y límite de peticiones; tests `backend/test/historical-chat.test.js`.
- RF-RAG-01/02/05: `backend/src/chat/historical-chat.js` usa retrieval MySQL FULLTEXT únicamente `indexed_at IS NOT NULL`, hasta seis extractos; invoca `LambdaClient/InvokeCommand desde el backend VPC hacia `boscochat-bedrock-inference` y BedrockRuntimeClient/ConverseCommand sólo en `backend/worker/historical-chat-bedrock.js`, desplegada sin VPC.` con maxTokens=650 y región/modelo configurables; devuelve ID/página/cita sin claves S3.
- RF-RAG-03/04: referencias enumeradas [F1...F6] derivadas sólo de SQL y enlazadas por la interfaz al visor autenticado. Validación de exactitud semántica de afirmaciones contra fuentes queda pendiente de revisor, no se considera acabada BC-103.
- TRACE-GAP: lockfile, CI, validación de IAM/Bedrock en AWS, residencia, política de retención, coste y seguridad prompt injection independiente. Feature flags OFF hasta revisión.

## Cierre funcional del archivo y alcance de chatbot administrador (2026-11-19)
- Evidencia directa de aceptación del responsable: buscador, filtros, resultados paginados y visor funcionan en la web; Gestión histórica también. Se actualizan BC-008/010/011/012/017 a estado DONE **a efectos de entrega funcional**. No existe en esta operación una nueva ejecución de pruebas adversarias, auditoría independiente o benchmarks.
- Seguimiento independiente: BC-018 incorpora TRACE-GAP para exactitud de funciones específicas SRS, búsqueda pública vs RF-USER-03, marcas invisibles / protección de descarga, seguridad, GDPR y rendimiento.
- BC-101 → RF-CHAT-01/02/03/06 y RNF-USE-02: UI y endpoints exclusivos de administrador con controles en backend e interfaz; sin acceso por otros roles.
- BC-102 → RF-RAG-01/02/05 y RNF-PERF-02: recuperación sólo lectura de `archive_pages`/documentos indexados y Bedrock Converse con datos acotados.
- BC-103 → RF-RAG-03/04 y RF-CHAT-07: citas verificables y enlace a la página autorizada en el visor.
- BC-104 → RF-CHAT-04/05, dependiente de BC-004 y BC-005: cuotas pagadas y activación futura, expresamente fuera del piloto.
- Confirmación de arquitectura preliminar: AWS Bedrock us-east-1 publica el candidato `amazon.nova-pro-v1:0` (ON_DEMAND) a 2026-11-19; todavía no hay chatbot implementado ni desplegado.
- TRACE-GAP: pruebas de aislamiento entre roles, amenaza de prompt injection en OCR, localización de datos, topes de gasto, retención de chats, IAM mínimo y verificación independiente antes de activar.

## BoscoChat — logo persistente junto al nombre (2026-11-18)
- Requisito de diseño: el retrato debe aparecer en la cabecera junto a «BoscoChat» siempre, no sólo en la portada.
- Código: `frontend/src/App.jsx` renderiza la marca fuera de condiciones de `view` y `user`; imagen decorativa con texto del H1 como nombre accesible; se retira duplicado de Inicio.
- TRACE-GAP: pruebas de compilación, visualización responsive y publicación Amplify.

## Seguridad de dependencias y frontend (2026-11-18)
- La identidad visual BoscoChat se integra junto con la sustitución de Vite por esbuild 0.28.2, eliminación de nodemon y generación de lockfiles auditados; artefactos: `frontend/scripts/build.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `backend/package.json`, `backend/package-lock.json`.
- Evidencia: workflow temporal de GitHub `refresh-and-verify` concluido en SUCCESS tras `npm ci`, compilación, pruebas, lint y `npm audit --audit-level=high` de ambos proyectos. Workflow temporal retirado automáticamente de la rama.
- Queda evidencia de despliegue en Amplify y comprobación manual de favicon/logo para cerrar la historia.

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


