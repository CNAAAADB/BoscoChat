# BC-105 — Dividir revistas anuales en números mensuales

## Flujo
1. Administrador o historiador ve «Escanear fragmentación por meses» en un documento indexado de `Don Bosco en España` (flag frontend `VITE_ARCHIVE_FRAGMENTATION=true`; backend `ARCHIVE_FRAGMENTATION_ENABLED=true`).
2. API comprueba rol, existencia de páginas OCR indexadas y VersionId de S3; analiza cabeceras con título, mes/año y posible número. No crea ni borra PDF en este paso.
3. La propuesta persistida permite cambiar límites inclusivos 1-based, mes inicial/final, número de edición, unir o dividir, siempre cubriendo todas las páginas sin huecos/solapes. Los números dobles se representan mediante rangos de meses; no se asume una periodicidad mensual.
4. Confirmación del usuario marca trabajo `queued` y despacha al worker asíncrono privado. Este verifica VersionId del original, extrae rangos físicos con qpdf, verifica el número de páginas de cada salida mediante pdfinfo y escribe nuevos PDF en el mismo S3 privado con `If-None-Match: *`.
5. Si todas las salidas están presentes, el worker abre transacción MySQL: copia los fragmentos OCR reenumerando páginas, registra mes/número/procedencia, activa los hijos, elimina páginas del anual, anula su fecha de indexación y registra tombstone por la versión original. Si falla, la transacción se revierte y el anual sigue apareciendo.
6. El directorio conserva el PDF anual; el buscador retorna nuevos PDF con mes y número. Los PDF S3 huérfanos de una operación fallida requieren limpieza/retención controlada: nunca eliminarlos indiscriminadamente.

## Invariantes y seguridad
- El original y sus versiones se conservan; jamás se sobrescriben.
- Los accesos de gestión están autenticados y limitados a administrador/historiador, también por backend.
- No ejecutar qpdf en Lambda Express ni confiar en índices de meses aportados por el cliente sin validarlos.
- No mostrar niños parcialmente indexados. Un trabajo `failed` permite edición y reintento; los archivos S3 generados previamente solo se reutilizan si los metadatos proceden del mismo trabajo.
- S3 necesita lectura de versión exacta (`s3:GetObjectVersion`), comprobación de cabeceras y escritura condicionada; RDS privado y TLS como el indexador actual. Configurar límites de concurrencia, tiempo, coste y alarmas.
- Exigir ensayo de fallo parcial, validación de colisiones, reintento de eventos SQS antiguos y comprobación de citas del visor.
- La detección heurística requiere texto OCR indexado: no hay todavía OCR nuevo, análisis visual ni Bedrock para portadas escaneadas. El usuario debe confirmar y corregir propuestas de baja confianza. Fase pendiente antes de asegurar cobertura de digitalizaciones de imagen.

## Despliegue controlado
1. Revisión CI/QA/seguridad independiente y aprobación del PR.
2. Copia de seguridad y migración aditiva `backend/scripts/migrate-archive.js` en staging (crea `archive_fragmentation_jobs` y `archive_fragmentation_issues`). Validación de columnas/índices y del esquema de tablas existentes.
3. Reconstruir/publicar worker Docker con qpdf en ECR; verificar IAM versión de S3, escrituras condicionadas y tiempo/ephemeral storage.
4. Actualizar backend Express, base de datos, worker y frontend. Mantener ambos flags desactivados hasta verificación.
5. Probar revista anual representativa, un número, varios números, número doble, OCR incompleto, fallo del último fragmento, reintentos y citas. Solo después encender `ARCHIVE_FRAGMENTATION_ENABLED` y `VITE_ARCHIVE_FRAGMENTATION`.
6. Vigilar CloudWatch, S3 y MySQL; registrar resultados. No marcar BC-105 DONE sin evidencia independiente.

## Endpoints
- `POST /api/admin/historical/documents/fragmentation-scan`: `{filename}` → propuesta persistida.
- `GET /api/admin/historical/fragmentation-jobs/:id`: consulta de estado y límites.
- `PUT /api/admin/historical/fragmentation-jobs/:id/segments`: validación y actualización de límites.
- `POST /api/admin/historical/fragmentation-jobs/:id/commit`: confirma y programa worker; 202 no significa indexación completada.
