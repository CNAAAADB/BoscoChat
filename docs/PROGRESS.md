## BC-101 — Persistencia de conversación y respuestas de Investigación (2026-11-20)
- El responsable confirma que las citas del chatbot ya abren el visor, pero la conversación se pierde y las respuestas de Investigación siguen resultando breves.
- Diagnóstico: `HistoricalChat` sólo utilizaba estado React; pese a permanecer montado durante una navegación ordinaria, la recarga o reinicio de la aplicación borraba el historial. Además enviaba únicamente tres intercambios y truncaba las respuestas anteriores a 1.200 caracteres.
- Corrección: persistencia temporal **por cuenta administradora y pestaña** en `sessionStorage`, hasta 40 mensajes y caducidad de dos horas, validación de esquema y límites, eliminación al cerrar sesión o iniciar una conversación nueva; no se almacena en servidor, no se habilita para otros roles.
- La API acepta cuatro intercambios usuario/asistente con texto de respuesta hasta 1.800 caracteres. El modo Investigación exige explicar antecedentes, acontecimientos, fechas y evolución con referencias verificables cuando las fuentes lo permiten; objetivo orientativo de 300–600 palabras para preguntas abiertas con evidencia suficiente, no mínimo incondicional.
- El worker Bedrock permite hasta 1.900 tokens y 10.000 caracteres de respuesta en Investigación, con límite explícito y mensaje de entrada acotado a 26.000 caracteres. Mantener cuotas 5/minuto y 30/día.
- Tests de persistencia/caducidad/aislamiento y contexto; pendiente CI, revisión independiente, publicación de imagen ECR para Lambda de inferencia y evaluación E2E de longitud con revistas reales.

## BC-012 — Incidencia al abrir cita del chatbot en el visor (2026-11-20)
- Captura proporcionada: Don Bosco en España (1978), página 23, muestra «No se ha podido completar la solicitud». CloudWatch backend 2026-11-20 10:54:46 UTC confirma `GET /api/archive/documents/33/pages/23/image` fallando con `ER_LOCK_DEADLOCK` y estado SQL `40001` (HTTP 500), antes de acceder al renderizador PDF; por tanto no indica PDF corrupto o referencia inexistente.
- Causa identificada: el limitador MySQL compartido que protege las imágenes hace lecturas/incrementos transaccionales; una colisión concurrente InnoDB aborta una transacción. Se reintenta hasta tres veces únicamente tras rollback seguro; si persiste se devuelve 503 temporal, sin desactivar la cuota.
- UX: el visor reintenta una sola vez lecturas GET autenticadas si recibe 503. Al abrir una referencia desde el chatbot se habilita «Volver al chat» y se conserva el historial en React durante la navegación.
- Pruebas nuevas: deadlock transitorio, persistente, error no transitorio, contención en limpieza y endpoint protegido con 503 sin saltarse limitador. Pendiente verificación CI, despliegue y prueba manual real con sesión admin.

## BC-101 — Modo Investigación con respuestas detalladas y citas (2026-11-19)
- Selección expresa del responsable: `Investigación — análisis detallado y referencias` como modo predeterminado del chatbot de administrador.
- Añadido selector `Investigación / Automática / Breve` en `HistoricalChat.jsx`, valor inicial `research`; preferencia transmitida como dato validado (`depth`), no como instrucción arbitraria del navegador.
- El modo investigación prioriza respuestas desarrolladas cuando la pregunta lo justifica, exige distinguir hechos/citas de lagunas, amplía a seis fuentes relevantes entre doce candidatos y genera hasta 1300 tokens con tope explícito de salida.
- Mantiene la autorización servidor administrador, límites de tasa/cuota y fuentes [F1]–[F6] verificadas por IDs de filas SQL; no implica aún recuperación semántica ni revisión histórica independiente.
- Pruebas automatizadas de los tres modos, citas F4, límite de fuentes y modo predeterminado. Publicación del worker de inferencia en AWS requiere actualización de su imagen ECR tras merge.
- TRACE-GAP: validar claridad, completitud, coste/latencia y exactitud de referencias con preguntas reales; no marcar BC-101/102 DONE hasta revisión independiente.

## BC-102 — Calidad de diálogo y selección de fuentes (2026-11-19)
- El responsable aporta ejemplo real: pregunta sobre la Casa Salesiana de Atocha produce respuesta extensa y técnica, apoyándose en seis referencias tangenciales (boda, lista de fallecidos, antiguos alumnos). Una coincidencia del topónimo «Atocha» no demuestra una referencia a la institución.
- Se reduce el contexto recuperado a las tres fuentes más pertinentes; para una entidad compuesta se requieren varios términos de la denominación en el OCR. Sólo se muestran en la interfaz las fuentes realmente citadas por el texto generado.
- Los extractos se centran en la zona de coincidencia de la página y las instrucciones de respuesta exigen contestación breve, relevante, sin «Según SQL» ni listas no solicitadas. Un cero literal jamás se presenta como total histórico cero.
- Se añaden regresiones para el caso concreto de Atocha, citas no utilizadas y extractos de OCR. Pendiente CI y verificación de calidad con datos reales. La búsqueda semántica/vectorial sigue pendiente de una historia independiente; no se declara equivalencia con ChatGPT.

## BC-101/102 — Corrección de enfoque: asistente conversacional real (2026-11-19)
- Feedback directo del responsable: la respuesta automática de `0 veces` no ofrece una experiencia como ChatGPT. La ruta del chat retornaba valores SQL o mensajes prefijados sin llamar a Bedrock en preguntas de conteo y sin resultados; el historial sólo contenía preguntas del usuario.
- Implementación propuesta: cualquier pregunta autorizada pasa por Amazon Bedrock Nova Pro, con historial acotado de tres turnos completos usuario/asistente, instrucciones de conversación y respuesta razonada. Los recuentos SQL literales pasan como evidencia opcional, no como respuestas predeterminadas.
- Cuando no aparecen fuentes, el modelo puede conversar y proponer variantes de búsqueda, pero debe reconocer ausencia de evidencia y no inventar hechos del archivo. Mantener citas sólo de páginas recuperadas.
- Permanece la autorización estricta `administrator`, flags, límites de inferencia, IAM y aislamiento de RDS/S3. Requiere CI, pruebas E2E de administración y revisión independiente antes de BC-101/102 DONE.

## BC-102 — Incidencia chat Atocha (2026-11-19)
- Captura del administrador: chat devolvía error genérico al preguntar por el número de menciones de la Casa Salesiana de Atocha. CloudWatch registra `INVALID_SEARCH_QUERY` en ejecución de la versión previa al PR #68. Se añade regresión exacta.
- Se elimina ruido lingüístico de la extracción conversacional y se distingue una pregunta de recuento literal de la generación con LLM: MySQL calcula coincidencias exactas en páginas indexadas, no se infiere un número de seis extractos. La respuesta explica límites OCR/grafías y no realiza llamadas al modelo para recuentos.
- Pendientes CI, revisión y despliegue. No se leen ni modifican originales S3.

## BC-101/102 — Piloto Bedrock administrador desplegado en AWS (2026-11-19)
- PR #67 fusionado. Lambda `boscochat-bedrock-inference` desplegada sobre imagen ECR inmutable, fuera de VPC, con rol que sólo invoca Nova Pro; no tiene S3/RDS. Evita endpoint de Bedrock de pago mensual.
- Backend en VPC privada usa `lambda:InvokeFunction` vía VPCE actual, IAM limitado a tres funciones; simulador confirma que no puede invocar Bedrock directamente.
- Pruebas reales AWS del modelo y de Lambda de inferencia con datos sintéticos: resultado 200, `status=ok`. Logging de invocación del modelo sin activar; logs de la Lambda con retención 14 días.
- Flags de piloto administrador activadas en Lambda backend y Amplify. Despliegue Amplify main #64 SUCCEED. No hay acceso a la pestaña ni API para otros roles por diseño y pruebas automáticas.
- PR #68 fusionado tras tres workflows verdes: las preguntas naturales largas se convierten en términos bounded compatibles con MySQL FULLTEXT.
- **TRACE-GAP:** falta E2E con sesión administradora en navegador, revisión independiente FULL (seguridad, privacidad, calidad/citas), datos reales de latencia. Se conserva estado IN_REVIEW; no darlo por DONE ni abrir a roles de pago.
- Procedimiento de despliegue/rollback: `docs/deployment/BC-101_ADMIN_CHAT_ROLLOUT.md`.

## Nota de despliegue BC-102 (2026-11-19)
- Se requiere una Lambda `boscochat-bedrock-inference` de propósito único sin acceso a MySQL/S3, permisos IAM restringidos a `amazon.nova-pro-v1:0` y `lambda:InvokeFunction` privado para el backend. En ausencia de esta infraestructura y pruebas, flags OFF.

## BC-101/102 — Piloto de chatbot histórico sólo administrador (2026-11-19)
- Rama de implementación: `feat/bc101-admin-bedrock-chat-20261119`. React presenta una pestaña `Chat histórico` sólo a `administrator` y únicamente si `VITE_BOSCOCHAT_CHAT_ADMIN=true`; mensajes, reinicio y fuentes enlazadas al visor existente.
- API `POST /api/admin/chat/message` montada detrás de `requireAuthorization` para administrador y flag backend `BOSCOCHAT_CHAT_ADMIN_ENABLED` (OFF por defecto), con 401 anónimos, 403 otros roles, limitador MySQL compartido y tamaño de mensajes acotado.
- Recuperación de seis páginas indexadas como máximo mediante MySQL FULLTEXT parametrizado, sin acceso de escritura; `Amazon Lambda inference aislada sin VPC, invocada mediante el endpoint privado de Lambda ya existente. La Lambda documental no necesita salida a Internet ni un nuevo endpoint de Bedrock, evitando coste fijo de red.` genera respuestas españolas con `maxTokens=650` explícitos y referencias documentales creadas desde SQL, no inventadas por el modelo. Historial de preguntas limitado a cuatro turnos, sólo en memoria del navegador.
- Pruebas de autorización, flags, límites, contexto y origen de citas incorporadas; pendiente actualizar package-lock con SDK Bedrock, ejecutar CI, revisión de seguridad independiente, IAM mínimo, políticas de privacidad y despliegue piloto por aprobación.
- **No se ha activado ni ejecutado una inferencia de Bedrock de producción**; sin modelo habilitado, no se generan costes de conversación.

## Cierre funcional documental y siguiente fase de BoscoChat — 2026-11-19
- El responsable del producto declara que los flujos en uso de buscador, filtros, paginación, presentación, visor, Gestión histórica, perfiles y administración funcionan correctamente. Solicita cerrar buscador y visor y aplazar suscripciones y pasarela.
- BACKLOG: BC-008, BC-010, BC-011, BC-012 y BC-017 pasan a DONE **por aceptación funcional explícita**. El cierre no certifica que todas las cláusulas del SRS ni los controles técnicos se hayan probado independientemente. BC-018, READY, recoge esas verificaciones concretas y la conciliación de búsqueda pública frente a RF-USER-03.
- Las historias de pago BC-004/BC-005 siguen aplazadas, sin activarlas ni modificar sus criterios.
- Siguiente desarrollo: BC-101 (READY, P1) para chat inicialmente restringido a `administrator`, y BC-102 (READY, P1, dependiente) para respuestas RAG basadas en el índice MySQL existente. BC-103 describe citas verificables y navegación por páginas; BC-104 pospone acceso por planes y cuotas hasta pagos verificados.
- AWS consultado directamente: Bedrock us-east-1 lista `amazon.nova-pro-v1:0` con capacidad ON_DEMAND. Es candidato inicial, no despliegue de modelo ni compromiso presupuestario; antes de activar, verificar residencia de datos, IAM mínimo, limites de coste y validación independiente.
- **Invariante de acceso**: ni usuario normal, ni historiador, ni futuro pagador pueden ver la entrada o invocar el endpoint del chatbot hasta que una nueva decisión de producto lo autorice. Una feature flag desactivada por defecto protege el piloto.

## BoscoChat — logotipo permanente en la cabecera (2026-11-18)
- Solicitud del propietario: situar el emblema a la izquierda de «BoscoChat» en la cabecera global, visible en todas las vistas y estados de autenticación, retirándolo del cuerpo exclusivo de Inicio.
- Implementado en `frontend/src/App.jsx` mediante contenedor flex responsive; favicon existente empleado a tamaño apropiado para evitar ampliarlo a 192 px, sin introducir nuevas dependencias.
- TRACE-GAP: validación de CI y despliegue Amplify, comprobación visual en móvil y escritorio.

## Seguridad de dependencias — BoscoChat (2026-11-18)
- Para publicar la identidad visual del PR #63 sin saltarse los controles, se sustituyó Vite 8 y su plugin React por esbuild 0.28.2 para empaquetar React y CSS; se retiró `nodemon` y se usa `node --watch` en el backend.
- La compilación conserva `VITE_*` como variables del entorno de Amplify, genera `dist/index.html` y los recursos `dist/assets/app.js` y `dist/assets/app.css` sin cambiar las rutas públicas de los originales.
- GitHub Actions, workflow temporal de regeneración de lockfiles, completó `npm ci`, lint, build, tests de backend y `npm audit --audit-level=high` en frontend y backend sin fallos, y retiró el propio workflow temporal.
- Pendiente validación del CI formal de la rama y despliegue final de Amplify para cerrar PR #63. La eliminación de hallazgos se ha comprobado con npm audit; esto no equivale a garantía absoluta frente a futuras vulnerabilidades.

## Brand — identidad BoscoChat (2026-11-18)
- Cambio de presentación solicitado por la entidad: nombre canónico **BoscoChat**, título de pestaña y metadatos HTML en español, favicon con retrato aportado por el usuario en sustitución del icono predeterminado de Vite, y presencia del retrato en la portada.
- El mismo archivo `frontend/public/favicon.svg` incorpora una versión optimizada, transparente y autocontenida del original suministrado (WebP embebido), utilizada por el icono de la pestaña y la imagen de inicio. Se evita depender de URLs de terceros.
- Archivos: `frontend/index.html`, `frontend/public/favicon.svg`, `frontend/src/App.jsx`. Pendiente CI y comprobación visual tras despliegue; no afecta a datos, autenticación ni API.

## BC-017 — Incidencia MySQL resuelta y UI desplegada (2026-11-16)
- Confirmación de CloudWatch: peticiones `DELETE /api/admin/historical/documents` terminaban en `ER_NO_SUCH_TABLE` (SQLSTATE 42S02).
- Diagnóstico privado de producción de seis tablas: `users`, `archive_documents`, `archive_pages`, `archive_deleted_sources` y `archive_manual_index_requests` existentes; **faltaba `admin_audit_logs`**.
- Snapshot cifrado previo `boscochat-pre-audit-repair-20261116` disponible. Se aplicó el DDL aditivo de `admin_audit_logs` conforme a la migración existente con tipo de `users.id` detectado; invocación privada devolvió `status=verified, remainingMissing=[]`. Segunda inspección: seis tablas presentes, ninguna ausente. Lambda efímera de diagnóstico eliminada.
- PR #61: errores y estado por PDF en la interfaz y diagnóstico de DB. Amplify job main 58 `SUCCEED`, commit `4d71163ef31894bed609ab3c99c4178e4af095ef`; flags backend indexar/desindexar/eliminar permanecen true.
- TRACE-GAP: no existe todavía prueba E2E de POST indexar/DELETE con cookie real de administrador y PDF sintético. No afirmar validación funcional completa ni marcar BC-017 DONE antes de esa prueba y revisión independiente.

## BC-017 — Error real en eliminación y estado de indexación (2026-11-16)
- CloudWatch del backend registra dos fallos `DELETE /api/admin/historical/documents` con `ER_NO_SUCH_TABLE` (`42S02`). El listado GET no fue el que falló.
- Añadida comprobación privada de `information_schema` para identificar cuál de las tablas de archivo/auditoría falta; reparación aditiva limitada a `admin_audit_logs`, con tipo derivado de `users.id` y sin leer/modificar datos históricos.
- Interfaz muestra progreso y errores junto al PDF seleccionado, en lugar de depender sólo de un aviso al principio del directorio.
- TRACE-GAP: ejecutar diagnóstico en RDS, aplicar sólo reparaciones necesarias, verificar pruebas/CI, demostrar POST indexar y DELETE contra PDF sintético autenticado, revisión independiente antes de cerrar BC-017.

## BC-017 — Corrección de eliminación e indexación de PDF genéricos (2026-11-16)
- Evidencia de producción: Lambda `boscochat-backend` con timeout de 15 segundos; CloudWatch registra respuestas de 15 segundos y `Status: timeout` durante las operaciones del archivo (correlación con la incidencia, pendiente traza de ruta). Se amplió a 28 s, manteniendo integración HTTP API de 30 s.
- La gestión anterior sólo ofrecía Indexar para `pending` (anuarios reconocidos), mientras que PDF de otras publicaciones estaban en estado `stored` y carecían del botón.
- Corrección propuesta: nueva acción «Catalogar e indexar» en PDF almacenados, con publicación/año validados y evento privado de ingesta; el worker sigue rechazando nombres inseguros. Los anuales conservan indexación automática/manual.
- TRACE-GAP: CI, revisión independiente, despliegue de worker, validación E2E con PDF sintético, medición de tiempo real de borrado y conciliación ante timeout. No declarar corregido un borrado real sin prueba positiva.

## BC-017 — Acciones activadas en AWS (2026-11-16)
- PR #57 fusionado, con CI de backend/frontend/worker en verde sobre el commit de la rama. Gestión histórica ofrece Indexar según estado pendiente, Desindexar según estado indexado, y Eliminar PDF como acción separada, con confirmación.
- Worker de ingesta actualizado mediante CloudFormation al digest OCI amd64 `sha256:05f32c4c7a3e82cbf711d55e1b686962d41dc92715a23f7ee61466a475da0dc1`; stack `boscochat-archive-ingestion` UPDATE_COMPLETE.
- IAM backend ampliado únicamente a `s3:DeleteObject` de `originals/*` y `lambda:InvokeFunction` de `boscochat-pdf-ingestor`; endpoint privado Lambda ampliado sólo al ingestor; simulador IAM confirma allowed en recursos previstos y implicitDeny en recursos ajenos.
- Flags Lambda `ARCHIVE_DOCUMENT_DELETE_ENABLED`, `ARCHIVE_MANUAL_INDEX_ENABLED`, `ARCHIVE_UNINDEX_ENABLED` en true, configuración Successful. Amplify flags correspondientes en true y deployment `main` job 55 SUCCEED (BUILD/DEPLOY/VERIFY).
- Limitación pendiente: indexación manual de PDFs genéricos sin catalogación; sigue restringida a anualidades reconocidas. TRACE-GAP: validación E2E con cuenta de administrador/historiador y PDF de prueba, revisión de seguridad independiente y control de fallos distribuidos de borrado S3/MySQL. No marcar BC-017 DONE únicamente por activación.

## BC-017 — Acción inversa según estado del PDF (2026-11-16)
- Nueva operación independiente `POST /api/admin/historical/documents/unindex`: elimina la entrada indexada y páginas en MySQL mediante CASCADE, preservando S3; añade marca de versión para bloquear ingestas rezagadas y escribe auditoría.
- Indexación manual de PDF previamente desindexados elimina su marca de supresión al aceptar la nueva petición. Frontend muestra «Indexar PDF» para anualidades pendientes y «Desindexar PDF» para indexadas.
- Configuración independiente de flags `ARCHIVE_UNINDEX_ENABLED` y `VITE_ARCHIVE_UNINDEX`, inicialmente OFF hasta pruebas y despliegue. El borrado completo sigue siendo acción distinta.
- TRACE-GAP: pruebas RDS+S3 de concurrencia, IAM, E2E y revisión independiente antes de activar funciones reales.

## BC-017 — Esquema MySQL actualizado en RDS (2026-11-16)
- Copia cifrada `boscochat-pre-bc017-index-delete-20261116`: AWS RDS confirma `available` antes y después de la operación.
- PR #55 fusionado. Se publicó el worker en ECR por digest inmutable y se ejecutó desde la VPC privada la Lambda efímera `boscochat-bc017-schema-migration-20261116` con operación `apply-bc017-additive-schema`.
- Evidencia de respuesta AWS Lambda Invoke 200: `{"status":"verified","tables":["archive_deleted_sources","archive_manual_index_requests"],"archivePagesOnDeleteCascade":true}`.
- La función temporal se eliminó y se verificó `ResourceNotFound`; RDS sigue `available` y `PubliclyAccessible=false`.
- No se modificó contenido documental. Las flags de eliminar/indexar siguen desactivadas; pendiente IAM, nueva imagen de ingesta en producción, pruebas E2E y revisión de seguridad antes de habilitarlas.

## BC-017 — Preparación de migración privada RDS (2026-11-16)
- Copia manual cifrada confirmada AVAILABLE: `boscochat-pre-bc017-index-delete-20261116` en us-east-1, antes de cambiar MySQL.
- RDS `boscochat-db` es MySQL 8.4.9, `PubliclyAccessible=false`; no usa Aurora/RDS Data API. No abrir puerto público.
- Migración propuesta en PR separado: `src/db/archive-migration.js` define sólo `CREATE TABLE IF NOT EXISTS` de `archive_deleted_sources` y `archive_manual_index_requests`; handler temporal `worker/archive-migration.js` en VPC para ejecutarla sin secretos fuera de AWS.
- Validación automatizada de columnas/PK y FK `archive_pages -> archive_documents ON DELETE CASCADE`. Pendiente CI, despliegue del worker revisado y ejecución/consulta en RDS. Hasta verificar, las flags de borrado e indexación siguen apagadas.

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
