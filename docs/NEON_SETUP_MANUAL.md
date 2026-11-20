# Configuración manual de Neon y Vercel — Cristal Sagrado · Registro

> **Objetivo:** habilitar backend aislado y gratuito para la rama `feat/neon-migration`; no registrar datos reales hasta que Codex finalice la migración y las pruebas.

## A. Crear Neon y vincularlo al proyecto correcto
1. Abrí [proyecto en Vercel](https://vercel.com/daegon13s-projects/cristal-sagrado-registro) (equipo `daegon13s-projects`). En **Storage** / **Marketplace Integrations**, elegí **Neon**.
2. Seleccioná **nuevo recurso Neon**, plan **Free / $0** (revisá el costo efectivo mostrado antes de confirmar). No vincules Smart Stock ni otros proyectos. Si ya tenés Neon, podés usar la opción **Link existing Neon account**.
3. Nombre sugerido: `cristal-sagrado-registro`; región **AWS São Paulo (`sa-east-1`)** si está disponible. Conviene situar las funciones de Vercel en `gru1` al configurar producción para evitar latencia a una DB brasileña.
4. Conectá Neon **solo** al proyecto Vercel `cristal-sagrado-registro`; seleccioná entornos `Preview` y `Production`. Para pruebas, usá **branch de base separado por preview**, si la integración lo permite, para que un PR nunca modifique producción.
5. **Enable Auth** (Neon Managed Better Auth) cuando la integración lo ofrezca. Si no, entrá en [Neon Console](https://console.neon.tech), seleccioná el proyecto y habilitá Auth allí. La integración Vercel puede inyectar `DATABASE_URL` y `NEON_AUTH_BASE_URL`; comprobar nombres reales en Vercel Settings → Environment Variables. No pegar valores ni enlaces con contraseñas en GitHub, issues, PR, chat, ni mensajes de correo.

## B. Configurar Auth y miembros
1. En Neon → Auth, habilitá un proveedor de inicio de sesión elegido para dos personas (correo/contraseña o correo verificado); revisá dominios/trusted origins para la URL de preview y dominio productivo del proyecto.
2. Creá/invitá **únicamente** las identidades de Lucía y Diego. No enviés contraseñas por chat.
3. Bloqueá registro abierto o aplicá una allowlist administrativa en servidor. Codex debe generar un flujo de bootstrap de la primera organización y sus dos `memberships` usando IDs reales **verificados**, sin inventarlos.
4. Habilitá verificación de correo y revisá persistencia/caducidad de sesión. La protección Vercel es una capa extra; jamás sustituye los permisos de la app.

## C. SQL — esperar a la migración de Codex
1. Usá el editor SQL de **la rama de ensayo** de Neon.
2. **No ejecutes** `sql/001_initial.sql` ni `sql/002_hardening.sql` originales: dependen de `auth.users`, `auth.uid()` y RPC Supabase.
3. Codex debe generar nuevas migraciones Neon y ejecutarlas primero en ensayo, verificar estructura de tablas y relaciones, idempotencia, auditoría, restricción por organización y pruebas con usuarios no autorizados.
4. Solo después de aprobación, instalar migraciones en producción con respaldo y procedimiento de reversión probado.

## D. Variables de Vercel (secrets)
En Project → Settings → Environment Variables, revisar:
- `DATABASE_URL`: secreta del servidor, valor que provisiona Neon/integración; **nunca** `NEXT_PUBLIC_DATABASE_URL`.
- `NEON_AUTH_BASE_URL` u otras variables exactas de SDK, según la documentación actual y la integración.
- `RESEND_API_KEY`: secreto de Resend (cuando esté listo), no en previews si envía correos reales.
- `REPORT_FROM_EMAIL`: dirección de un dominio verificado en Resend.
- `REPORT_TO_EMAIL`: **ya configurado** como `damgmarin13@gmail.com`.
- `CRON_SECRET`: valor aleatorio fuerte, secreto del servidor, para el cron semanal.
- `REPORT_ORG_ID`: UUID real de organización cuando el bootstrap esté completado.
No usar variables falsas que simulen conexión ni dejar rutas de correo abiertas sin autenticación. Nuevas env vars requieren **nuevo despliegue**.

## E. Ejecutar Codex y verificar
1. Abrí [PR de migración](https://github.com/Daegon13/cristal-sagrado-registro/pull/1); Codex debe editar **solo** `feat/neon-migration`.
2. Tomá como contrato `docs/CODEX_NEON_MIGRATION.md`. No fusionar hasta lograr `npm ci`, `npm run typecheck`, `npm test`, `npm run build` y pruebas E2E contra Neon.
3. Probar con datos **ficticios**: nueva consulta, nuevo contacto, venta, cobro, devolución, anulación, segunda cuenta, usuario no autorizado, reportes CSV/JSON sin PII, mismo movimiento enviado dos veces.
4. Revisión de sesión y seguridad antes de permitir datos reales. Mantener `main` intacta hasta dar GO.

## Enlaces
- https://vercel.com/integrations/neon
- https://neon.com/docs/ai/ai-rules-neon-auth
- https://neon.com/blog/auth-that-just-works-in-vercel-previews
- https://github.com/Daegon13/cristal-sagrado-registro/tree/feat/neon-migration
