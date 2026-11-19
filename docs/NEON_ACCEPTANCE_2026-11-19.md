# Neon: aceptación de Preview (19/11/2026)

## Decisión: NO-GO para Production

PR #1 continúa sin fusionar. El Preview del commit `32300d3` está `READY` y `/api/health` devuelve HTTP 200 con `configured:true`. La integración técnica y el flujo financiero ficticio funcionan en la rama Preview. Faltan la comprobación del acceso real de Lucía y Diego, el correo controlado de Resend y la restauración de un respaldo. Production no recibió esquema ni datos de la app.

## Entorno y datos

- Proyecto Neon `little-credit-80176183`. Rama Production `br-mute-cake-b6lh2rom`; rama de ensayo usada por Vercel Preview `preview/feat/neon-migration` (`br-shy-salad-b6nmhtc9`). La rama `vercel-dev` (`br-little-silence-b6tha5l9`) también tiene la migración desde el 18/11, pero no es la conexión del Preview actual.
- Antes de ejecutar `sql/003_neon_initial.sql` en la rama Preview, `public` estaba vacío. Se aplicó solo a esa rama, una vez; quedaron nueve tablas y los disparadores contables. La rama Production sigue con cero tablas públicas de la app.
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y `NEON_AUTH_BASE_URL` de Preview pertenecen a la misma rama Preview. `NEON_AUTH_COOKIE_SECRET`, `CRON_SECRET` y `REPORT_ORG_ID` están limitados a `feat/neon-migration`. `REPORT_ORG_ID` identifica a Cristal Sagrado (`f397405c-e520-4172-b4d7-0d06b786b20f`).
- Neon Auth tiene dos usuarios administrativos sin contraseña, creados para `mayadalucia@gmail.com` (ID `07ebe457-f75b-46ac-8741-21591dea7acc`) y `damgmarin13@gmail.com` (ID `02c8bcdb-aca2-450d-92ca-32b117e247a0`). Ambos IDs están enlazados a `memberships` de Cristal Sagrado. El alta directa por contraseña y por Magic Link está cerrada. Una petición directa de alta con identidad ficticia devolvió HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- La identidad ficticia de QA pertenece únicamente a la organización `QA ficticia - Preview` (`54911b5e-8018-4698-9a36-20d70e32acba`). Cristal Sagrado conserva exactamente dos membresías y cero contactos, ventas, cobros y gastos de prueba.

## Aceptación ejecutada

- Antes de otorgarle membresía alguna a QA: inicio de sesión real contra Neon Auth desde Preview; `/api/me`, consulta de cobros, exportación, escritura e informe devolvieron 403. Las rutas financieras sin sesión devolvieron 401. El endpoint de sesión respondió `Cache-Control: no-store`.
- Con QA dentro de su organización ficticia: consulta con idempotencia, cliente, segunda consulta, venta, seña, saldo, devolución, rechazo de devolución excesiva con HTTP 400, cobro erróneo y su anulación auditada, gasto con idempotencia, listas de cobros y auditoría, exportaciones JSON y CSV. El saldo neto de la venta verificada fue 2500 UYU. La respuesta de un gasto repetido detectó un fallo de comparación de fechas que se corrigió en `32300d3` y luego pasó en el Preview real.
- Con sesión válida de QA, lectura, escritura, exportación e informe dirigidos al ID de Cristal Sagrado devolvieron 403. Una consulta directa a la rama Preview confirmó que esa organización sigue sin datos de prueba. Las comprobaciones SQL del 18/11 en `vercel-dev` fueron transaccionales y se revirtieron.
- `npm run typecheck`, `npm test` (9/9), `npm run build`, `npm audit --audit-level=moderate` (cero vulnerabilidades) y `git diff --check`: PASS en esta revisión. `npm ci` pasó el 18/11 y no se repitió el 19/11; no cambiaron dependencias.

## Pendiente para GO

1. Lucía y Diego deben abrir el Preview protegido por Vercel, solicitar el enlace de acceso con sus propios correos y comprobar que acceden a Cristal Sagrado. La creación de sus identidades y membresías se verificó; no se ha comprobado la entrega ni el uso de sus enlaces. El correo saliente de Neon Auth aún usa el servicio compartido, sin SMTP propio verificado.
2. Resend: faltan `RESEND_API_KEY` y `REPORT_FROM_EMAIL` en Vercel; `REPORT_TO_EMAIL` ya existe. Configurar un destinatario de prueba controlado, comprobar JSON/CSV, hash, recepción y no duplicación, y después configurar el destinatario definitivo y Production. No se ha afirmado envío ni cron de correo.
3. Probar restauración del respaldo JSON sobre una rama de recuperación aislada y comparar conteos y totales antes de usar Production. La migración productiva y la fusión de `main` requieren aprobación humana.

La autorización financiera se verifica en las rutas del servidor. La conexión PostgreSQL usa un rol propietario; este informe no afirma RLS para quien posea esa credencial. Las pruebas de QA usan datos ficticios y permanecen solo en la rama Preview.
