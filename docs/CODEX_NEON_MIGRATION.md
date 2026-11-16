# Codex: migración de Supabase a Neon (Cristal Sagrado · Registro)

## Contexto comprobado (16/11/2026)
- Repositorio: `Daegon13/cristal-sagrado-registro`; rama estable `main`. Rama de trabajo: `feat/neon-migration`.
- Vercel: equipo `daegon13s-projects`, proyecto `cristal-sagrado-registro`, id `prj_kDrAYqml8JcQ8RSFPW3fbVuzpTtt`. Existe build `READY` de la versión antigua, pero no hay backend operativo.
- Stack existente: Next.js 15 App Router, React 19, TypeScript, Supabase Auth + PostgREST, Resend. Rutas `app/api/reports/send/route.ts`, `app/api/cron/weekly/route.ts`, `app/api/health/route.ts`; interfaz `app/page.tsx`; SQL `sql/001_initial.sql`, `sql/002_hardening.sql`.
- Actualmente Vercel solo tiene configurada `REPORT_TO_EMAIL`; no hay Neon vinculado.
- Es una contabilidad privada en UYU. No utilizar datos reales de clientes para pruebas.
- No tocar el proyecto de la web pública ni otras bases de datos.

## Tarea
Migrar íntegramente el backend a **Neon PostgreSQL con autenticación gestionada Neon Auth (Managed Better Auth)**, si su documentación oficial actual confirma compatibilidad y seguridad con Next.js 15; si existe un impedimento verificable, documentarlo y seleccionar una alternativa de autenticación madura con sesiones HttpOnly y credenciales cifradas (nunca una contraseña única de aplicación). NO mantener Supabase como dependencia residual. Usar documentación oficial actual de Neon y sus SDK; evitar copiar ejemplos desactualizados.

### Restricciones arquitectónicas
1. Preferir `@neondatabase/serverless` + SQL parametrizado o Drizzle ORM en **servidor**. `DATABASE_URL` solo como variable secreta del servidor. Ninguna consulta financiera ni cadena Postgres puede ejecutarse en el navegador.
2. Implementar rutas seguras/server actions para consultas, clientes, ventas, cobros, devoluciones, gastos, correcciones, exportación, auditoría e informes. Todos los endpoints deben comprobar en servidor sesión vigente **y** membresía de organización, con roles admin/operador. Nada de autorizar por email enviado desde el cliente.
3. Neon Auth: revisar setup de Auth para Next.js vigente, dominios de confianza, emails de Lucía y Diego, prohibir altas públicas no autorizadas, cookies seguras, protección CSRF y expiración de sesiones. Si no existe `neon_auth` en el proyecto aún, el código y migraciones deben tolerar el estado hasta activación; no insertar usuarios ficticios.
4. Preservar la semántica de `organizations`, `memberships`, `contacts`, `inquiries`, `sales`, `payments`, `expenses`, `audit_log` y `report_dispatches`. Revisar SQL existente, pero **NO ejecutar tal cual** scripts de Supabase: contienen `auth.users`, `auth.uid()`, RLS/RPC de PostgREST y funciones dependientes de Supabase. Adaptarlos a PostgreSQL puro con migraciones versionadas, restricciones y transacciones.
5. Neon Auth puede representar `user.id` como string: verificar tipo real. No asumir UUID compatible con Supabase. Guardar actor/miembro con tipo adecuado (p. ej., text), documentando por qué.
6. Garantizar aislamiento de organizaciones en lectura, inserción, actualización y referencias cruzadas; no confiar en `orgId` aportado por el navegador. Emplear restricciones de base, controles en cada endpoint y, si conviene, RLS correctamente configurado: nunca afirmar protección RLS solo por habilitar una política incompatible con el rol de conexión.
7. Mantener idempotencia: `register_inquiry` debe crear contacto + consulta en una sola transacción, usando clave única de idempotencia; cobros y gastos no deben duplicarse tras reintentos, respuestas perdidas ni doble clic. Anular en lugar de borrar; motivo obligatorio, autor y auditoría inmutable. Proteger contra modificaciones o borrados arbitrarios vía interfaz.
8. Separar venta comprometida de cobro real; distinguir pagos, devoluciones y anulaciones; calcular en UYU. Períodos semanales en `America/Montevideo`, sin supuestos erróneos de UTC. Gasto publicitario ingresado manualmente ≠ recibo de Meta ni cliente pago.
9. Preservar reportes Gmail con `Resend`: destinatario fijo `REPORT_TO_EMAIL`, remitente validado, datos estructurados (JSON y CSV) sin alias ni datos personales, resumen de pagos y gastos; idempotencia/registro de envíos y errores. Cron semanal `/api/cron/weekly` protegido mediante `CRON_SECRET`; evitar envíos dobles.
10. Exportación JSON/CSV y recuperación paginada de datos; jamás informar totales si hay registros truncados. Añadir respaldo y estrategia de recuperación. La app debe mostrarse como **configuración pendiente** sin backend en vez de fallar o exponer endpoints.
11. Mantener interfaz mobile-first y PWA; Lu debe poder registrar una consulta o cobro en pocos toques. No reescribir UI innecesariamente.
12. Seguridad: nada de secretos en Git/cliente, logger o respuesta API. Actualizar `.env.example`, `README.md`, configurar variables `DATABASE_URL`, las de Neon Auth que correspondan a la versión SDK, `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `REPORT_TO_EMAIL`, `CRON_SECRET`, `REPORT_ORG_ID`. Proteger preview/production e impedir correos reales desde pruebas.
13. Usar dependencias versionadas con `package-lock.json`; quitar `@supabase/supabase-js` una vez migrado. Revisar `npm audit`, cambios mínimos razonables sin despliegues peligrosos.

### Entregables
- Migraciones SQL ejecutables sobre una base Neon **vacía** en orden, reversibles cuando sea viable, sin referencias a Supabase.
- Implementación completa backend + frontend y autenticación, con validación de entrada y errores amigables.
- Documentación `docs/NEON_SETUP.md` paso a paso: crear cuenta/proyecto Neon (Free), región AWS Sudamérica cercana a Uruguay si está disponible, habilitar Neon Auth, poner dominios autorizados, configurar dos usuarios, Vercel Integration/env, aplicar migraciones, preparar Resend, probar y rollback.
- Pruebas unitarias e integración para idempotencia, permisos cruzados, usuario anónimo, pagos parciales, refund, anulación, cálculos y horario uruguayo.
- Evidencia: ejecutar `npm ci`, `npm run typecheck`, `npm test`, `npm run build`; informar realmente lo que pasó. Smoke test servidor antes de fusionar.
- Solo modificar `feat/neon-migration`; crear PR **draft** hacia `main` con lista de pruebas y bloqueantes. No publicar en production ni introducir credenciales falsas. Solicitar acciones del usuario solo cuando las requiera Neon/Vercel/Auth.

## Criterios de aceptación obligatorios
- Login de Lu y Diego funciona, pero otras identidades (aun registradas) no pueden acceder a datos.
- Cliente A no puede consultar ni modificar datos de organización B manipulando IDs de API.
- Una consulta con el mismo idempotency_key se registra una sola vez, aun con reintento.
- Un cobro de $U 2.500, seña $U 1.000, devolución $U 500 y anulación de un error quedan claramente diferenciados y auditados; no se duplican.
- El total semanal concuerda con movimientos de prueba y períodos Uruguay; no depende de vistas parciales paginadas.
- Informe a Gmail contiene agregados exactos, sin alias ni información privada, y no se reenvía accidentalmente.
- No hay llamadas a Supabase, claves de Supabase ni `NEXT_PUBLIC_DATABASE_URL` en el código final.
- Build de preview correcto + prueba end-to-end con Neon **de pruebas**, sin tocar datos de producción.
- Dejar `main` y el despliegue existente sin cambios hasta revisión humana.

## Referencias actuales
- https://neon.com/docs/ai/ai-rules-neon-auth
- https://neon.com/docs
- https://vercel.com/integrations/neon
- https://vercel.com/docs/environment-variables
