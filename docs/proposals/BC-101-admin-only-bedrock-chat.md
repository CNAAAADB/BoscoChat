# BC-101 / BC-102 — Chatbot histórico con Amazon Bedrock (piloto sólo administrador)

**Estado:** diseño aprobado como alcance de producto solicitado el 2026-11-19; no implementado ni activado. 
**Objetivo:** conversar sobre el archivo histórico de BoscoChat mediante respuestas fundamentadas en fragmentos recuperados de la base de datos documental.

## 1. Modelo y plataforma

- Servicio: Amazon Bedrock desde backend Node.js en AWS; API `Converse`, no invocaciones directas del navegador.
- Candidato inicial confirmado por la cuenta en us-east-1 el 2026-11-19: `amazon.nova-pro-v1:0`, compatible con demanda bajo demanda. Configurar `BOSCOCHAT_BEDROCK_MODEL_ID` y región en Lambda, sin credenciales ni tokens en frontend.
- Antes del despliegue, resolver el tratamiento geográfico de datos: la infraestructura documental actual está en `us-east-1`. Evaluar obligaciones GDPR, residencia permitida y condiciones del proveedor; **no usar un inference profile global sin decisión explícita**.
- No aprovisionar automáticamente Knowledge Base ni índice vectorial nuevo. La primera iteración usa la recuperación SQL FULLTEXT actual, más económica de poner en marcha y compatible con documento/página existentes. Un índice vectorial/Bedrock Knowledge Base se decidirá tras medir las preguntas que la búsqueda textual no resuelve.

## 2. Acceso: cierre por defecto y sólo administración

- `BOSCOCHAT_CHAT_ADMIN_ENABLED=false` en backend por defecto; `VITE_BOSCOCHAT_CHAT_ADMIN=false` en frontend. No mostrar pestaña, rutas ni mensajes promocionales a otros perfiles.
- Protección **obligatoria en servidor**: `requireAuthorization(authService, new Set(['administrator']))` en todas las rutas, incluyendo historial, mensajes, citas, herramientas y restablecimiento.
- 401 sin sesión; 403 para `documentary_manager`, `free`, `pro`, `premium` y `advanced`, aunque se fuerce la petición manualmente. Revalidar sesión y privilegios en cada solicitud (no confiar en estado React).
- Ningún usuario podrá pasar un identificador ajeno para recuperar otra conversación. Considerar sesión independiente del chat; acceso al corpus sólo por rutas autorizadas. No enviar objetos S3, claves de almacenamiento ni datos de otras cuentas a la LLM.
- Al crear suscripciones/pagos, introducir una **nueva** política y nuevos casos de prueba de límites por plan. Nunca heredar acceso del mero rol de pago ni activar por defecto.

## 3. Flujo de respuesta recuperada (RAG)

1. Administrador envía pregunta española acotada y una ID de conversación validada.
2. Backend verifica sesión, rol, flag, longitud, cuota de peticiones, presupuesto y límites de contexto.
3. Backend convierte la pregunta a términos de búsqueda **sin aceptar SQL generado por modelos**. Reutiliza `searchArchivePages` sobre `archive_pages` y `archive_documents` filtrando `indexed_at IS NOT NULL`. Recupera como máximo los mejores N fragmentos con metadatos y texto acotado.
4. Formar un prompt con jerarquía explícita: contenido OCR es material de referencia no confiable; instrucciones dentro del documento se ignoran. Pasar pregunta, contexto y páginas con IDs de fuente separados.
5. Invocar Bedrock mediante IAM restringido, con `maxTokens` explícito, temperatura acotada, tiempo máximo, y reintentos limitados ante throttling. Registrar coste/token estimado sin almacenar contenido sensible en logs.
6. Responder en español sólo con afirmaciones apoyadas por fragmentos. Si faltan evidencias, decirlo. Adjuntar únicamente referencias fuente existentes y verificadas contra los resultados recuperados.
7. El clic en una cita usa el visor ya protegido, con `documentId` y `pageNumber` comprobados por backend; jamás URL pública S3.

## 4. Protección de datos y seguridad

- Modelo sin credenciales ni permisos MySQL/S3: sólo recibe extractos seleccionados por el servicio.
- El rol IAM de Lambda permite invocar exclusivamente el modelo/perfil autorizado. No dar `bedrock:*` ni recursos `*` indiscriminadamente.
- Defensa ante inyección de prompt en PDFs: instrucciones del OCR no pueden pedir secretos, cambios de roles, manipular consulta SQL ni acceder a APIs administrativas.
- Definir política de retención para historial de chat y mensajes; ocultar PII de logs. Guardrails y política de logging deben revisarse para GDPR porque la máscara de PII en salida no garantiza que los originales no se registren.
- Límites: longitud de prompt, tokens entrada/salida, contextos/páginas, peticiones/minuto, concurrencia y gasto máximo AWS. Usar métricas de CloudWatch, alertas y presupuesto.
- Aplicar revisiones de dependencia, CSRF, prompt injection, abuso de costes, respuestas engañosas, autorización y verificación independiente antes de activar.

## 5. Pruebas de aceptación del piloto

- Administrador: ve pestaña, hace preguntas, recibe respuesta con cita, puede abrir página y reiniciar conversación.
- Historiador, usuario gratuito y cualquier futuro rol de pago: no ven pestaña ni acceden a rutas (403). Visitantes: 401.
- Texto de archivo malicioso, PDF eliminado/desindexado, preguntas sin respuesta, documento sin OCR y peticiones concurrentes: no comprometen permisos ni fabrican referencias.
- Estado desconectado de Bedrock, acceso IAM denegado, límite de cuota, errores HTTP: mensajes seguros y claros, sin filtrar prompts/credenciales.
- Los datos documentales nunca se modifican como efecto de preguntar.

**Orden de desarrollo:** BC-101 UI + ruta segura, BC-102 recuperación y generación, BC-103 citas/página, BC-104 cuotas cuando exista validación del sistema de pagos. Preferir un PR completo que deje un piloto funcional pero con flag desactivada hasta el visto bueno.
