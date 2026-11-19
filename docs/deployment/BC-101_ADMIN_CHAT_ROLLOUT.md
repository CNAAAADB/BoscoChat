# BC-101/102 — Despliegue de piloto Bedrock, exclusivamente administradores

Fecha: 2026-11-19. Región: `us-east-1`. Cuenta: misma cuenta AWS de BoscoChat.

## Código y comprobaciones

- Función de autorización API: `backend/src/routes/historical-chat.js`. Capa RAG: `backend/src/chat/historical-chat.js`.
- Worker de inferencia: `backend/worker/historical-chat-bedrock.js`. Frontend: `frontend/src/HistoricalChat.jsx` y `frontend/src/App.jsx`.
- PR #67 fusionado; CI backend/frontend/worker completado correctamente y `npm audit --audit-level=high` sin hallazgos en el CI de dependencias.
- PR #68 fusionado; los tres workflows en verde para la extracción segura de términos desde preguntas conversacionales largas.
- Pruebas automáticas: 401 anónimo, 403 historiador/free/pro/premium/advanced, 404 con feature flag backend OFF, respuesta sin fuentes, referencias desde SQL, límite por minuto, límite diario, modelo no disponible y no filtrado de detalles internos.
- **TRACE-GAP:** no se ha realizado todavía una prueba E2E completa desde sesión de administrador real, ni una auditoría FULL independiente. Se necesita antes de declarar `DONE` y abrir el acceso a otros roles.

## Infraestructura desplegada

1. `boscochat-bedrock-inference`: Lambda Docker de propósito único, sin VPC ni Function URL, `ImageConfig.Command = worker/historical-chat-bedrock.handler`, Node.js 22 en la imagen, 512 MB, timeout 25 s. Imagen inmutable de `boscochat-pdf-worker` para commit `1128b9892b77c5d4080c16d015498c6cec4e4e8d`, digest Linux AMD64 `sha256:1a593934e33f01cd234cfe74c804562bfe2fd36d47d8bf4cda0574cc4ddce83d`.
2. Rol `BoscoChatBedrockInferenceRole`: sólo `bedrock:InvokeModel` para `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0`, más escritura en su grupo CloudWatch; SIN permisos para S3 o RDS. Simulador IAM confirma `allowed` sólo para el modelo, `implicitDeny` para S3 y RDS.
3. Registro privado `/aws/lambda/boscochat-bedrock-inference` con retención 14 días. El logging de invocaciones del modelo en Bedrock se comprobó `not configured`; no registrar preguntas ni fuentes.
4. Lambda backend `boscochat-backend`: en VPC privada sin NAT, invoca únicamente el worker por el endpoint Lambda existente mediante `@aws-sdk/client-lambda`. Políticas IAM `BoscoChatPrivatePageRendererInvoke` y VPC endpoint `vpce-0fb8b8294057b3182` permiten exclusivamente las tres funciones `boscochat-pdf-page-renderer`, `boscochat-pdf-ingestor`, `boscochat-bedrock-inference`. El backend tiene `implicitDeny` para `bedrock:InvokeModel`.
5. No se ha creado un endpoint de Bedrock de coste fijo. La inferencia se factura sólo por consumo del modelo y de Lambda.
6. Prueba AWS: invocación real de Nova Pro (maxTokens=20) y del worker aislado (pregunta y fuente sintéticas), HTTP Lambda 200, `status=ok`, respuesta sobre el año 1925, consumo 60 tokens entrada / 14 salida.
7. Backend: `BOSCOCHAT_CHAT_ADMIN_ENABLED=true`, `BOSCOCHAT_CHAT_INFERENCE_FUNCTION=boscochat-bedrock-inference`. Amplify app: `VITE_BOSCOCHAT_CHAT_ADMIN=true`. Amplify main job #64 `SUCCEED` (BUILD/DEPLOY/VERIFY), commit `1128b9892b77c5d4080c16d015498c6cec4e4e8d`. La posterior corrección de backend PR #68 se debe comprobar contra los runs de `main`.

## Límites del piloto

- Sólo rol de servidor `administrator`; otros roles no ven navegación ni pueden invocar el endpoint. Sin sesión → 401. Otros roles → 403.
- Máximo 5 consultas/minuto por origen y 30 consultas/24 h por administrador, usando tabla MySQL compartida `auth_rate_limits`.
- Máximo 500 caracteres por pregunta, cuatro preguntas de contexto, seis extractos OCR de hasta 1250 caracteres. `maxTokens=650`; respuesta 5000 caracteres como máximo.
- No hay SQL generado por modelo ni instrucciones ejecutables en los documentos. Citas documentales desde filas MySQL verificables, no URLs directas S3.
- Historia en memoria de la sesión del navegador; no hay persistencia de conversaciones. No conceder acceso a ningún plan de pago hasta verificar suscripción/cuotas en BC-104.

## Operación y reversión

- **Desactivar inmediatamente:** establecer `BOSCOCHAT_CHAT_ADMIN_ENABLED=false` en la Lambda backend; invalida las API incluso si la pestaña siguiera visible en un navegador.
- Ocultar la pestaña después: establecer `VITE_BOSCOCHAT_CHAT_ADMIN=false` en Amplify y ejecutar nuevo job RELEASE de `main`.
- No borrar el indexador ni archivos del archivo histórico para desactivar el chatbot.
- Antes de marcar `DONE`: revisión independiente de control de acceso, PII/GDPR, inyección en OCR, calidad de citas, cuota, coste, errores y pruebas con una cuenta administradora y material no sensible.
