# Neon: verificación de integración (18/11/2026)

## Estado: NO-GO para Production

La rama de código `feat/neon-migration` está en `2220233` y la PR #1 sigue en borrador. Vercel compiló ese commit como Preview `READY`; ese despliegue precede a la configuración nueva de variables, por lo que no demuestra funcionamiento con Neon. No se modificaron `main` ni el despliegue productivo.

## Comprobado

- Variables de la integración Neon–Vercel presentes en el proyecto `cristal-sagrado-registro`. Las conexiones Development y Production respondieron desde PostgreSQL; sus IDs de rama son distintos (`br-little-silence-b6tha5l9` y `br-mute-cake-b6lh2rom`). Ambas estaban sin tablas públicas de la app antes de la migración; `neon_auth.user` existía y tenía cero usuarios.
- Se aplicó `sql/003_neon_initial.sql` **solo** a Development, tras comprobar que su esquema `public` estaba vacío y que `organizations` y `memberships` no existían. Resultado: nueve tablas públicas, tres disparadores de cobros y cero organizaciones. Production sigue sin tablas de la app ni usuarios Auth.
- `DATABASE_URL` de Preview quedó limitada a la rama Git `feat/neon-migration` y apunta a la rama Neon Development. `NEON_AUTH_COOKIE_SECRET` y `CRON_SECRET` de Preview se generaron aleatoriamente y se guardaron como variables sensibles de esa misma rama Git. No se configuró Resend en Preview.
- Prueba SQL real en la rama Development: 13 comprobaciones de membresía, referencias entre organizaciones, idempotencia, cobros, devolución, anulación, auditoría y conteos. Se ejecutó dentro de una transacción que se revirtió; después había cero organizaciones, contactos y cobros. Esta prueba **no** acredita login ni llamadas HTTP con sesión.
- `npm ci`, `npm run typecheck`, `npm test` (9 casos), `npm run build`, `npm audit --omit=dev --audit-level=moderate`, `npm audit --audit-level=moderate` y `git diff --check`: PASS. Las auditorías informaron cero vulnerabilidades.

## Pendiente antes de GO

1. Neon Auth: el conector Neon de esta sesión todavía responde `USER_NOT_LOGGED_IN`; inspeccionar la configuración de la rama Development, obtener su `NEON_AUTH_BASE_URL`, cerrar el alta directa, configurar dominios permitidos y verificar el proveedor de correo. En Vercel aún falta esa URL de Preview. Las dos identidades autorizadas no existen todavía en la rama de ensayo; crear/verificar ambas, obtener sus IDs auténticos y recién entonces insertar `organizations` y `memberships` y configurar `REPORT_ORG_ID`.
2. Crear un nuevo deployment de Preview después de completar variables. Probar con las dos cuentas y una identidad sin membresía: sesión, consultas, clientes, venta, seña, saldo, devolución, anulación, historial, exportaciones JSON/CSV y aislamiento al manipular IDs de organización. No usar datos reales de clientes.
3. Resend: falta cuenta/clave de API, remitente verificado y prueba de envío controlado. No poner una clave real en Preview mientras `REPORT_TO_EMAIL` apunte al buzón real. Verificar JSON/CSV sin datos identificables, hash, deduplicación y recepción antes de activar el cron.
4. Verificar respaldo y restauración sobre una rama descartable, además de los controles de acceso y Auth directo, antes de migrar el esquema a Production. La migración productiva requiere aprobación humana.

El esquema usa comprobación de sesión y membresía en las rutas de la app; la conexión del servidor es propietaria de PostgreSQL. No se afirma aislamiento RLS para acceso directo a esa credencial. Mantener `DATABASE_URL` exclusivamente en servidor y restringida a Vercel.
