# BC-006 — propuesta de almacenamiento documental privado en AWS

Estado: **PROPOSED / BLOCKED**. Esta propuesta no implementa BC-006 ni autoriza un despliegue.

## Objetivo

Almacenar PDF originales, derivados OCR e índices sin acceso público directo, con autorización mediada por el backend, cifrado, mínimo privilegio y trazabilidad de acceso.

## Diseño propuesto

- Un bucket S3 privado por entorno y cuenta AWS, con Block Public Access completo y Object Ownership `Bucket owner enforced`; sin ACL.
- Cifrado SSE-KMS obligatorio mediante bucket policy. Clave separada por entorno, rotación habilitada y permisos de uso limitados a los roles de ingesta y lectura.
- Versionado habilitado. Lifecycle independiente para originales, derivados, versiones no actuales y cargas incompletas; no fijar retenciones hasta aprobación de producto/privacidad.
- Prefijos separados: `quarantine/`, `originals/`, `derived/ocr/` y `derived/index/`. La ingesta escribe primero en cuarentena; validación de tipo, tamaño, hash y análisis antimalware preceden el movimiento lógico a originales.
- Metadatos documentales y autorización en la base estructurada. El cliente nunca recibe credenciales S3 ni una URL pública. El backend comprueba sesión, rol y permiso de documento antes de leer o emitir, si se aprueba, una URL firmada de vida muy corta.
- Roles IAM separados para ingesta, lectura backend, procesamiento y operación. Cada rol restringido al bucket, prefijos y acciones necesarios; sin `s3:*` ni `kms:*` globales.
- Bucket policy con TLS obligatorio, denegación de objetos sin SSE-KMS y restricción opcional a VPC endpoint cuando la arquitectura de red esté aprobada.
- Auditoría de aplicación para actor/documento/acción/resultado, sin registrar contenido ni URL firmada. CloudTrail data events para lecturas/escrituras S3 y alertas ante cambios de policy, intentos públicos o denegaciones anómalas.

## Flujo de acceso

1. El usuario solicita un documento al backend autenticado.
2. El backend resuelve el documento y aplica autorización por rol/estado del recurso.
3. El backend registra la decisión de acceso.
4. El backend transmite el contenido o emite una URL firmada de duración mínima, según decisión arquitectónica pendiente.
5. S3/KMS deniegan cualquier acceso fuera del rol, prefijo, cifrado y transporte permitidos.

## Evidencia exigida antes de declarar BC-006 entregada

- IaC revisada y aplicada en un entorno representativo; no configuración manual como única evidencia.
- Pruebas negativas: acceso anónimo, URL pública, rol equivocado, objeto sin cifrar y acceso fuera de prefijo deben fallar.
- Prueba positiva desde el backend con autorización válida y registro de auditoría correlacionable.
- AWS IAM Access Analyzer y comprobaciones de policy sin findings HIGH/CRITICAL.
- Prueba de carga/lectura, versionado, lifecycle, backup/restore y borrado conforme a la política aprobada.
- Revisión independiente FULL de cloud/IAM/KMS/S3/API y actualización de arquitectura, decisiones, backlog, progreso y trazabilidad.

## Aprobaciones todavía necesarias

1. Región/cuenta AWS y propiedad/administración de la clave KMS.
2. Proxy backend frente a URL firmada corta, duración y controles anti-reutilización.
3. Retención y borrado de originales, OCR, índices, versiones y logs conforme a privacidad/producto.
4. Servicio y proceso de análisis antimalware, cuarentena y respuesta ante detecciones.
5. Activación y retención de CloudTrail data events, presupuesto y destinatarios de alertas.

Hasta resolver estas decisiones y obtener evidencia, BC-006 permanece `BLOCKED`.
