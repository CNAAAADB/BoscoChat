# BC-006 — propuesta de almacenamiento documental privado en AWS

Estado: **PROPOSED / BLOCKED**. Esta propuesta fija defaults técnicos cerrables, pero no implementa BC-006 ni afirma que exista infraestructura desplegada.

## Objetivo

Almacenar PDF originales, derivados OCR e índices sin acceso público directo, con autorización mediada por el backend, cifrado, mínimo privilegio y trazabilidad de acceso.

## Diseño propuesto

- Un bucket S3 privado por entorno y cuenta AWS, con Block Public Access completo y Object Ownership `Bucket owner enforced`; sin ACL.
- Cifrado SSE-KMS obligatorio mediante bucket policy. Clave separada por entorno, rotación habilitada y permisos de uso limitados a los roles de ingesta y lectura.
- Versionado habilitado. Lifecycle independiente para originales, derivados, versiones no actuales y cargas incompletas; no fijar retenciones hasta aprobación de producto/privacidad.
- Prefijos separados: `quarantine/`, `originals/`, `derived/ocr/` y `derived/index/`. La ingesta escribe primero en cuarentena; validación de tipo, tamaño, hash y análisis antimalware preceden el movimiento lógico a originales.
- Metadatos documentales y autorización en la base estructurada. El cliente nunca recibe credenciales S3, claves de objeto ni URL S3. Para el MVP se adopta **proxy backend**: el backend comprueba sesión, rol, estado del documento y cuota antes de transmitir el contenido desde S3. Las URL firmadas directas quedan fuera del baseline hasta una decisión posterior con threat model específico.
- Roles IAM separados para ingesta, lectura backend, procesamiento y operación. Cada rol queda restringido al bucket, prefijos, acciones y clave KMS necesarios; sin `s3:*` ni `kms:*` globales. El rol backend solo obtiene objetos ya aprobados; la ingesta solo escribe en `quarantine/`; el procesador lee cuarentena y escribe originales/derivados; borrado y lifecycle permanecen en un rol operativo separado.
- Bucket policy con TLS obligatorio, denegación de objetos sin SSE-KMS y restricción opcional a VPC endpoint cuando la arquitectura de red esté aprobada.
- Auditoría de aplicación para actor/documento/acción/resultado, sin registrar contenido ni URL firmada. CloudTrail data events para lecturas/escrituras S3 y alertas ante cambios de policy, intentos públicos o denegaciones anómalas.

## Flujo de acceso

1. El usuario solicita un documento al backend autenticado.
2. El backend resuelve el documento y aplica autorización por rol/estado del recurso.
3. El backend registra la decisión de acceso.
4. El backend transmite el contenido como proxy, con cabeceras de caché privadas, sin revelar bucket, clave de objeto ni URL S3.
5. S3/KMS deniegan cualquier acceso fuera del rol, prefijo, cifrado y transporte permitidos.

## Evidencia exigida antes de declarar BC-006 entregada

- IaC revisada y aplicada en un entorno representativo; no configuración manual como única evidencia.
- Pruebas negativas: acceso anónimo, URL pública, rol equivocado, objeto sin cifrar y acceso fuera de prefijo deben fallar.
- Prueba positiva desde el backend con autorización válida y registro de auditoría correlacionable.
- AWS IAM Access Analyzer y comprobaciones de policy sin findings HIGH/CRITICAL.
- Prueba de carga/lectura, versionado, lifecycle, backup/restore y borrado conforme a la política aprobada.
- Revisión independiente FULL de cloud/IAM/KMS/S3/API y actualización de arquitectura, decisiones, backlog, progreso y trazabilidad.

## Decisiones técnicas propuestas para aprobación

1. **Privacidad S3:** bucket por entorno, Block Public Access completo, Object Ownership `Bucket owner enforced`, sin ACL ni website hosting.
2. **Cifrado:** SSE-KMS obligatorio con CMK separada por entorno; política que deniega transporte sin TLS, cifrado distinto de la CMK y accesos fuera de los roles/prefijos definidos.
3. **Entrega:** proxy backend como único canal MVP; no URL S3 ni presigned URL entregada al navegador.
4. **Mínimo privilegio:** roles separados de ingesta, procesamiento, lectura backend y operación; permisos KMS limitados por servicio S3, bucket y contexto de cifrado.
5. **Auditoría:** evento de aplicación por decisión de acceso y CloudTrail data events para lecturas/escrituras, correlacionables sin registrar contenido ni credenciales.

## Riesgos residuales

- El proxy incrementa coste y latencia del backend; deben medirse tamaño, concurrencia, timeouts y presión de memoria/streaming.
- Un usuario autorizado puede capturar el contenido que visualiza; la ausencia de URL directa no constituye DRM.
- Un PDF malicioso puede atacar el parser incluso con límites; se requiere aislamiento, antimalware y cuarentena antes de promoverlo.
- Una policy KMS/IAM incorrecta puede producir indisponibilidad o exposición; IaC, Access Analyzer y pruebas negativas son obligatorios.
- Auditoría y CloudTrail contienen identificadores vinculables a personas; acceso, retención, borrado y DSAR deben aprobarse.
- Eliminación de clave KMS, lifecycle o versiones puede destruir evidencia/documentos; se requieren separación de funciones, backup/restore y ventanas de borrado.

## Decisiones humanas todavía necesarias

1. Cuenta/región AWS, residencia de datos y propietarios distintos para administración/aprobación de la CMK.
2. Retención y borrado de originales, OCR, índices, versiones, auditoría y backups conforme a privacidad/producto.
3. Servicio antimalware, aislamiento del parser, SLA de cuarentena y respuesta ante detecciones.
4. Retención/coste de CloudTrail data events, destinatarios de alertas y proceso de respuesta.
5. RPO/RTO, backup/restore y procedimiento de recuperación/borrado criptográfico.

Hasta aprobar las decisiones humanas, implementar IaC/backend y obtener evidencia representativa e independiente, BC-006 permanece `BLOCKED`.

