# BC-017 — Despliegue controlado de eliminar e indexar PDF

## Alcance

- `DELETE /api/admin/historical/documents`: confirma un nombre de archivo seguro; oculta la versión actual en S3 privado (bucket versionado) y borra `archive_documents` y `archive_pages` (FK `ON DELETE CASCADE`).
- `POST /api/admin/historical/documents/index`: solicita a `boscochat-pdf-ingestor` una ejecución asíncrona para un original anual reconocido que todavía no figure indexado.
- Autorización comprobada por sesión en backend: roles `administrator` y `documentary_manager`; `free` y anónimos denegados.
- Se rechazan claves arbitrarias, rutas con traversal y PDF no anuales en indexación. Los no anuales requieren flujo de catalogación de publicación/año antes de ser indexables. El borrado sí admite originales genéricos con nombre seguro.

## Dependencias y secuencia obligatoria de despliegue

1. Respaldar la base de datos y probar la migración en staging. Ejecutar `backend/scripts/migrate-archive.js` desde una identidad con acceso al RDS privado. Comprobar `archive_deleted_sources` y `archive_manual_index_requests`, además de las FK y su `ON DELETE CASCADE`. No activar código nuevo de worker antes de crear las tablas.
2. Ejecutar la batería de tests del backend, frontend, worker y MySQL; completar revisión independiente FULL sobre autorizaciones, CSRF, coste/abuso, carreras S3/MySQL e IAM, más pruebas sobre la base de datos real.
3. Publicar la imagen aprobada del PDF-worker y actualizar el stack `boscochat-archive-ingestion` con digest inmutable; probar `index-archive-pdf` asíncrono y la protección ante versiones S3 eliminadas, manteniendo SQS automático operativo.
4. En el rol `boscochat-backend-role-yvarjgvz`, añadir sólo `s3:DeleteObject` para `arn:aws:s3:::boscochat-archivo-pdfs/originals/*`; añadir `lambda:InvokeFunction` para `arn:aws:lambda:us-east-1:909186483504:function:boscochat-pdf-ingestor`. No ampliar a otros buckets ni Lambdas. Validar la política del bucket y la endpoint policy de S3.
5. Ampliar la policy del endpoint privado `vpce-0fb8b8294057b3182` para que autorice invocar el ingestor además del renderizador actual. Mantener la restricción del grupo de seguridad. El VPC endpoint de Lambda existe; no se requiere crear uno para SQS.
6. Desplegar backend y comprobar que `GET /api/admin/historical/documents` sigue operando. Sólo entonces activar `ARCHIVE_DOCUMENT_DELETE_ENABLED=true` y `ARCHIVE_MANUAL_INDEX_ENABLED=true` en Lambda, y recompilar Amplify con `VITE_ARCHIVE_DOCUMENT_DELETE=true` y `VITE_ARCHIVE_MANUAL_INDEX=true`.
7. E2E en staging con PDF sintético no sensible: subida, indexación solicitada (202), estado indexado, búsqueda, borrado confirmado, ausencia en S3 visible y MySQL, imposibilidad de leer página; repetir con ingesta deliberadamente concurrente, comprobar 429 al solicitar indexaciones repetidas y 401/403 con cuentas sin permiso.
8. Sólo habilitar en producción tras evidencia de revisión y pruebas. Tener rollback de código/flags y procedimiento de restauración de una versión concreta S3 documentados.

## Controles y riesgos

- El bucket `boscochat-archivo-pdfs` tiene versioning habilitado (consulta AWS 2026-11-16). `DeleteObject` crea un marcador que oculta la versión actual. Versiones anteriores siguen retenidas, consumen almacenamiento y se gestionan aparte según política aprobada; la UI no debe afirmar un borrado físico irrecuperable.
- `archive_deleted_sources` marca el `VersionId` borrado. El worker lo comprueba dentro de la transacción de indexación antes de escribir páginas. Una subida posterior con nuevo `VersionId` puede volver a indexarse. Se requiere el identificador de versión S3, evitando operar a ciegas sobre originales antiguos sin control de versiones.
- `archive_manual_index_requests` aplica cooldown de diez minutos por original; HTTP 202 sólo significa que Lambda aceptó la petición asíncrona, no que haya terminado correctamente.
- MySQL y S3 no ofrecen transacción distribuida: fallos entre `DeleteObject` y `COMMIT` pueden requerir conciliación/recuperación. No habilitar hasta probar explícitamente estos casos. Pendientes auditoría persistente y política formal de retención/borrado.
- Las flags de backend y frontend parten desactivadas. La fusión del código sin activar flags **no** implica que las funciones estén disponibles.

## Validación de permisos y evidencia

- Backend anónimo = HTTP 401; usuario normal = 403.
- Historiador y administrador: inventario/descarga, solicitud de indexación y borrado tras confirmación.
- Invalid filename = HTTP 400; S3 objeto no encontrado = 404; PDF genérico sin catalogar = 409; reintento reciente = 429.
- Comprobar que un PDF eliminado deja de aparecer tanto en la búsqueda pública como en el directorio privado, incluso con notificaciones de SQS anteriores en vuelo.

**Estado:** despliegue bloqueado hasta migración, IAM, revisión independiente y verificación E2E. No realizar pruebas de borrado sobre originales históricos reales.
