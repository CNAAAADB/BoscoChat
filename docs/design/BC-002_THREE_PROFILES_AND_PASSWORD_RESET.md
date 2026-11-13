# BC-002 — Tres perfiles de acceso en BoscoChat

Decisión del propietario (2026-11-13): tres **perfiles de producto**: **Administrador de plataforma**, **Historiador** y **Usuario**.

| Perfil visible | Valor persistido | Gestión de cuentas | Gestión histórica | Búsqueda / visor |
| --- | --- | --- | --- | --- |
| Administrador de plataforma | `administrator` | Alta, baja, suspensión, concesión de roles, emisión de restablecimientos de contraseña | No | Sí |
| Historiador | `documentary_manager` | No | Sí: inventario, subida, consulta y descarga privada de originales | Sí |
| Usuario | `free` | No | No (403 incluso invocando la API) | Sí |

Los valores históricos `pro`, `premium` y `advanced` siguen siendo válidos **para leer cuentas existentes**: no se borran usuarios ni se convierte su plan en silencio. No pueden asignarse desde el nuevo panel; se presentan como perfil Usuario hasta separar formalmente `subscription_plan` del rol de acceso. El requisito RF-USER-04 del SRS prevé más categorías y requiere reconciliación explícita de esta decisión: **TRACE-GAP**.

## Recuperación de contraseñas

1. Administrador selecciona otro usuario y solicita enlace de recuperación (no puede restablecer su propia cuenta usando la administración).
2. Backend emite token criptográficamente aleatorio de 256 bits, almacena solo SHA-256 en `password_reset_tokens`, 20 minutos de validez y uno pendiente por usuario; audita la emisión sin token.
3. Administrador transmite el enlace de un solo uso al titular por un canal privado (no existe todavía proveedor de email). No debe pegarse en sistemas públicos, historiales de incidencias o logs.
4. El titular abre el enlace, establece una nueva contraseña (mínimo 12 caracteres), y el backend consume transaccionalmente el token, actualiza el hash scrypt y revoca **todas las sesiones** del titular.
5. Token inválido/caducado devuelve error sin revelar datos del usuario; API con rate limiting compartido.

**Activación controlada:** antes de habilitar el restablecimiento ejecutar `backend/scripts/migrate.js` en entorno controlado, verificar `password_reset_tokens` y las migraciones contra MySQL 8, ejecutar pruebas de integración y revisión independiente FULL sobre autenticación/autorización. Solo entonces configurar Lambda `PASSWORD_RESET_ENABLED=true` y recompilar Amplify con `VITE_PASSWORD_RESET=true`. Ambas opciones permanecen apagadas de forma predeterminada.

## Integración con BC-017 Gestión histórica

PR #41 (todavía independiente) debe limitar su ruta protegida `/api/admin/historical` exclusivamente al historiador; el administrador de plataforma **no** gestiona originales por defecto. Un usuario normal no ve la pestaña ni accede a endpoints incluso si conoce la URL. La publicación y los permisos AWS de BC-017 siguen bajo revisión de seguridad.

## Evidencia pendiente

Pruebas positivas/negativas con MySQL real, concurrencia de tokens, revocación de sesiones, phishing del enlace, protección de secretos y riesgo de administración de cuentas; la segregación de funciones debe ser validada por revisor independiente. NO marcar BC-002 DONE sin pasar controles. Un sistema de recuperación por email automatizado requerirá integrar y validar proveedor de correo.
