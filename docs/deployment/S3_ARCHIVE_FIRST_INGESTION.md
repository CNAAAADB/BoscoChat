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
