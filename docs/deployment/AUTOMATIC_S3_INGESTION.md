# BC-007 — Ingesta automatica de PDF en AWS (preparacion, no desplegada)

## Objetivo y alcance
Cada PDF anual nuevo o reemplazado en `s3://boscochat-archivo-pdfs/originals/` genera un evento y se indexa en MySQL sin intervención manual. Los 92 PDF historicos se incorporan una sola vez mediante backfill. El OCR avanzado de las paginas sin texto se difiere; sus numeros se conservan con `needs_review`.

## Arquitectura
1. S3 Object Created -> EventBridge (debe habilitarse **en la configuracion de notificaciones del bucket**).
2. Regla EventBridge `boscochat-new-pdf` -> cola SQS `boscochat-pdf-ingestion`.
3. Lambda `boscochat-pdf-ingestor` (contenedor Node.js 22 + Poppler) recibe mensajes SQS por lotes de 1.
4. Worker en la VPC de RDS descarga un unico PDF usando el Gateway endpoint S3, comprueba `pdfinfo`, extrae texto por pagina y actualiza `archive_documents` y `archive_pages` en una transaccion.
5. Hasta tres intentos por mensaje; despues, mensaje en DLQ `boscochat-pdf-ingestion-dlq`. La DLQ exige observabilidad y remediacion; no es una bandeja que se vacie sola.

## Archivos
- `infra/archive-ingestion.yaml`: CloudFormation (SQS, DLQ, EventBridge, IAM limitado, Lambda).
- `backend/worker/Dockerfile`: imagen Lambda con `poppler-utils`.
- `backend/worker/handler.js`: procesador.
- `backend/worker/ingestion-events.js`: validador estricto de mensajes.
- `backend/scripts/queue-archive-backfill.js`: importacion inicial, **dry-run** por defecto.

## Prerrequisitos y seguridad
- No hacer publicos S3 ni RDS. La Lambda usa subredes de `vpc-02f28e9c3d2d0eab2` y SG `sg-0c280487ace7bd7b5` que ya accede a RDS: validar autorizacion antes de reutilizar el SG.
- Confirmar instantanea reciente de RDS y que `archive_documents`/`archive_pages` existen. Probar primero en staging o con una anualidad conocida.
- Region `us-east-1`; cuenta AWS bajo control de usuario; no poner contrasenas, claves o certificados privados en GitHub.
- Parámetros DB de CloudFormation `NoEcho` ocultan su visualizacion, pero siguen presentes en la configuración de Lambda. En una version productiva, preferir Secrets Manager e IAM minimo, con VPC endpoint y rotacion.
- El contenedor AWS de Node22 necesita SDK S3 v3 accesible en runtime. Validarlo en CI/imagen antes de publicar; no confundir CI que construye zip del backend con construccion ECR del worker.
- Hay que habilitar `Amazon EventBridge` en S3 > Propiedades > Notificaciones de eventos del bucket. No confundirlo con crear solamente la regla EventBridge; **sin esta opcion los eventos no llegan a la cola**.
- La regla filtra prefijo `originals/`; el worker filtra PDF anuales estrictamente y manda mensajes inesperados a DLQ. Un archivo ajeno o carpeta produce fallo controlado.
- S3 y SQS son sistemas al-menos-una-vez: los mensajes pueden repetirse. La tabla tiene `UNIQUE (s3_key)`, el worker bloquea el documento y reemplaza paginas atomica/idempotentemente; un mismo PDF no crea documentos duplicados.
- Controlar volumen y costo: Lambda 2048MB, /tmp 2048MB, concurrency reservado 2, timeout 900s, SQS 5400s visibility. Aun debe probarse con documentos grandes y estimar costo.
- `pdftotext` no hace OCR; una pagina de imagen queda vacia con `needs_review`. Los PDF enteramente sin capa de texto pueden indexarse solo con paginas vacias y requerir un proceso OCR posterior, a verificar.
- Verificar manejo de un fichero corrupto, limites de tamaño (350MiB), conteo de paginas, timeouts, DLQ, alarmas, coste y rollback **antes de produccion**.
- No habilitar el procesamiento masivo antes de pasar CI y revision de seguridad independiente.

## Publicar la imagen (operacion futura, NO ejecutada)
Desde un host con Docker/AWS CLI y permisos ECR, y tras revisar/validar el PR:
1. Crear un repositorio privado ECR llamado `boscochat-pdf-worker`.
2. Desde `backend/`, construir la imagen con `docker build -f worker/Dockerfile -t boscochat-pdf-worker .`.
3. Autenticarse en ECR con AWS CLI y subir la imagen. Usar el digest inmutable `...@sha256:...` como parametro `WorkerImageUri`.
4. Desplegar `infra/archive-ingestion.yaml` en CloudFormation con `CAPABILITY_NAMED_IAM`, las dos subredes de Lambda, SG, DB_HOST y credenciales runtime introducidas fuera de Git.
5. Habilitar notificaciones EventBridge del bucket y verificar mediante una **subida de prueba** y logs CloudWatch que se procesa y valida el numero exacto de paginas.
6. Crear alarmas de DLQ (mensajes visibles > 0), errores Lambda y edad de la cola antes de backfill.

**Importante:** Este fichero no contiene los comandos finales automatizados de despliegue ECR ni acceso programatico a AWS. Los pasos requieren acciones explicitas del propietario en su cuenta.

## Primera ingesta historica (92 PDFs)
- Primero probar `node backend/scripts/queue-archive-backfill.js <QUEUE_URL>` sin `--send` desde un shell con AWS CLI, permiso `s3:ListBucket` limitado a `originals/` y `sqs:SendMessage` en la cola.
- Revisar el numero de anualidades aceptadas (inventario confirmado: 92, incluyendo 1922-1931 y 1944-2025; el objeto vacio `originals/` se ignora).
- Tras ensayar con un mensaje unico/ambiente de prueba y validar los controles, ejecutar el mismo comando con `--send` **una sola vez**. Supervise DLQ y progreso; subir un archivo nuevo después desencadena el procesamiento automaticamente sin Github Action programada.
- No ejecutar backfill desde el CloudShell VPC sin confirmar conectividad SQS; una alternativa es el CloudShell normal con identidad limitada a listado y envio a cola.
- Nunca publicar en repositorio inventario con datos personales ni claves AWS.

## Verificacion de completitud
Consultar MySQL agrupando `archive_documents`/`archive_pages` por anualidad, comparar registros indexados y numero de paginas PDF (`pdfinfo`). No considerar `indexed_at` valido si falta alguna pagina.
Verificar desde API la busqueda publica de max 10 fragmentos cuando la funcion este validada y protegida ante abuso; el visor original sigue protegido.

## Proximas tareas de producto
- BC-016: enlazar dominio oficial a Amplify/API Gateway con HTTPS, comprobando CORS y cookies.
- BC-017: crear gestion documental web privada para administradores/gestores: subir, listar, filtrar por nombre y descargar; subida dispara esta misma canalizacion automatica.

## Estado actual
Codigo y plantilla en rama de trabajo. **NO existe evidencia de despliegue de ECR, SQS, EventBridge o Lambda del worker en AWS**. CI, validacion independiente, coste, alarmas y prueba e2e pendientes.
