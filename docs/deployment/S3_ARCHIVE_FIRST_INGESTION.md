# Primera conexión verificable con Amazon S3 (BC-006)

El corpus de PDFs anuales está en el bucket **privado** `boscochat-archivo-pdfs`, región `us-east-1`, prefijo `originals/`. El propietario está subiendo 92 PDFs; la carga parcial no debe contabilizarse como terminada.

Este procedimiento permite verificar la **conexión real con S3 y su inventario** sin abrir el bucket, otorgar permisos públicos ni descargar PDFs. No indexa todavía el contenido ni modifica la base de datos. Se ejecuta desde un entorno con AWS CLI y un rol/usuario autorizado para `s3:ListBucket`, preferentemente AWS CloudShell con una identidad de mínimo privilegio.

```bash
aws sts get-caller-identity
aws s3api list-objects-v2 \
  --region us-east-1 \
  --bucket boscochat-archivo-pdfs \
  --prefix originals/ \
  --output json > /tmp/boscochat-inventory.json
node backend/scripts/preview-s3-inventory.js /tmp/boscochat-inventory.json /tmp/boscochat-report.json
```

El segundo comando requiere el repositorio (o estos scripts) disponible en el mismo entorno. El informe identifica `originals/Don Bosco en España_1922.pdf` y nombres equivalentes; conserva las claves originales. La lista S3 puede incluir cargas parciales mientras la transferencia sigue en curso; repetir al finalizar.

**Limitaciones:** `ListObjectsV2` devuelve como máximo 1000 objetos por llamada. El comando anterior no pagina de forma explícita si se invoca con opciones que deshabiliten paginación; el informe marca truncado si la respuesta indica `IsTruncated`. El ETag no se acepta como SHA-256. Es una vista previa, no un catálogo persistente ni prueba de integridad. No imprimir credenciales ni incluir inventarios privados en GitHub.

**Próxima pieza de implementación:** proceso de ingestión protegido que descargue por lotes desde S3, extraiga texto por página (OCR selectivo), persista `documento/año/página/fragmento` y actualice índice de búsqueda. Diseñar tamaño máximo por PDF, memoria, reintentos, estados de error, permisos IAM y auditoría; el backend Lambda dentro de la VPC puede requerir un **VPC Gateway Endpoint para S3** o egress configurado. En producción, usar permiso `s3:GetObject` solo en `arn:aws:s3:::boscochat-archivo-pdfs/originals/*` y permiso `s3:ListBucket` condicionado al prefijo `originals/`; sin permisos S3 desde el navegador.

Para conectar con MySQL, comprobar primero la migración real de tablas `documents/pages`; el buscador heredado hace `LIKE` contra esas tablas y no constituye una búsqueda indexada completa.

## Primer buscador indexado (propuesta implementada en el PR, NO desplegada)

Componentes:
- `backend/scripts/migrate-archive.js`: crea `archive_documents` y `archive_pages` con indice MySQL FULLTEXT.
- `backend/scripts/ingest-archive-pdf.js`: ingiere un PDF anual desde S3 con AWS CLI + Poppler `pdftotext`, conserva numeracion de paginas y marca texto sospechoso. Actualiza el indice de una anualidad atomica e idempotentemente.
- `GET /api/archive/search?q=Don%20Bosco&year=1922`: buscador inicial autenticado, por palabras obligatorias y filtro anual. Mantiene las cuotas; no ofrece aun operadores OR, frases entrecomilladas, resaltado, ni visor.
- No existe aun UI especifica para este endpoint; la web usa `/api/search` heredado hasta integrar el nuevo flujo. Este PR **no activa** automaticamente resultados en producción.

### Preparación de una prueba en un entorno de ingesta con acceso a RDS

1. Instalar Node.js, AWS CLI y Poppler (`pdftotext`), configurar una identidad AWS temporal de minimo privilegio: `s3:GetObject` en `arn:aws:s3:::boscochat-archivo-pdfs/originals/*`. No usar el usuario root ni claves persistentes compartidas.
2. Ejecutar en un worker **con acceso de red al RDS privado**, por ejemplo host dentro de la VPC con salida a S3 controlada. AWS CloudShell no tiene necesariamente acceso a RDS privado. Lambda en VPC puede necesitar endpoint de S3.
3. Respaldar RDS y probar primero en staging con las credenciales `DB_*` configuradas fuera del repositorio.
4. Desde `backend/`, ejecutar `npm run migrate:archive` y luego:
   ```bash
   node scripts/ingest-archive-pdf.js 'originals/Don Bosco en España_1922.pdf'
   ```
5. Verificar numero de paginas y revisar visualmente las marcadas `needs_review`; contrastar busquedas con el PDF original.
6. Una vez desplegado el backend y migrada la base, consultar autenticadamente `GET /api/archive/search?q=Bosco&year=1922`.

**Advertencias:** El importador tiene limite de archivo de 350 MiB y de 5.000 paginas; el limite puede ajustarse tras medir el corpus. Cada PDF se descarga a almacenamiento temporal y se elimina. Los errores no destruyen un indice previo porque la sustitucion se hace en una transaccion MySQL. No crear permisos publicos S3 ni URLs prefirmadas para el navegador. El texto de PDFs con OCR deficiente requiere revision/OCR selectivo. No lanzar la ingesta sobre los 92 PDF sin pasar primero la prueba de muestra y medir tiempos, memoria y coste.

**Pendientes para producto:** frontend de resultados, extractos centrados en coincidencias, vista PDF autorizada por backend, procesamiento en segundo plano con estado/reintento, indice mejorado (frases, AND/OR) y OCR selectivo automatizado.

### Activación de la interfaz

El frontend incluye la interfaz de consulta por palabras y filtro de año, protegida tras una **feature flag**. Solo una vez migrada la base, indexada la muestra, desplegada la API y validadas las pruebas, establecer `VITE_ARCHIVE_SEARCH=true` en el build de Amplify. En ausencia de esa variable continúa usando la ruta histórica `/api/search`. No activar la flag por adelantado: mostraría un buscador sin documentos indexados.

El buscador inicial de FULLTEXT MySQL no implementa todavía frases exactas ni operadores combinados AND/OR personalizados, ni el visor PDF. Las páginas con bajo contenido o anomalías se marcan para revisión manual y eventual OCR posterior.
