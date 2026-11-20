# Cristal Sagrado · Registro

Aplicación privada para consultas, clientes, ventas, cobros, devoluciones, gastos e informes semanales en UYU. Next.js 16, Neon PostgreSQL y Neon Managed Better Auth. La interfaz conserva el flujo móvil de Lu y la PWA. Los datos financieros se consultan y modifican en el servidor con SQL parametrizado; el navegador nunca recibe credenciales Postgres.

**Estado:** la PR #1 sigue en borrador y el uso real sigue en NO-GO. El flujo rápido de la incidencia #2 y la migración `004` se probaron en Preview. La configuración de Production, el acceso desde el Honor con URL definitiva y la conciliación de despachos QA quedan pendientes. Ver [informe de preproducción](docs/ISSUE_2_PREPROD_2026-11-20.md), [aceptación previa](docs/NEON_ACCEPTANCE_2026-11-19.md) y [configuración](docs/NEON_SETUP.md).

## Instalación

1. Crear proyecto y rama Neon exclusivos. Habilitar Managed Better Auth. Aplicar `sql/003_neon_initial.sql` y luego `sql/004_daily_register.sql` a la rama vacía aprobada. Los scripts `001` y `002` son históricos de Supabase y no se ejecutan en Neon.
2. Crear administrativamente las identidades de Lucía y Diego en Neon Auth. Crear organización y `memberships` con sus IDs reales como explica `docs/NEON_SETUP.md`. El registro público se bloquea en el proxy de la app; la URL directa de Neon Auth requiere revisión de configuración por separado.
3. Configurar secretos de `.env.example` en servidor o Vercel. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` deben apuntar a la **misma rama de ensayo**. No usar variables `NEXT_PUBLIC_` para secretos. `REPORT_TO_EMAIL` es fijo; no se acepta destinatario del navegador.
4. Ejecutar `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, y `npm run dev`. Abrir `/api/health` para verificar `configured`. Sin variables, la pantalla indica configuración pendiente.

## Modelo contable

`sales.agreed_amount` representa venta comprometida, no dinero recibido. `payments` almacena cobros y devoluciones; una anulación conserva el asiento y registra autor, motivo y momento. `expenses` representa gasto manual. Los importes son `numeric(12,2)` y los informes calculan en centésimos UYU. La diferencia entre neto cobrado y gastos registrados no es beneficio fiscal ni conciliación bancaria. La fuente de un contacto es declarada, no atribución verificada de Meta.

Cada operación sensible verifica sesión y membresía en servidor. Las claves foráneas compuestas `(org_id,id)` impiden referencias entre organizaciones. Las operaciones repetibles tienen claves de idempotencia; contacto y consulta se crean en una transacción. Las listas se recuperan en páginas y el informe calcula sobre todas las filas del período en la base, sin límite PostgREST. El respaldo JSON autenticado incluye todas las tablas de la organización, auditorías y envíos; `/api/export?format=csv` exporta movimientos. Conservar el respaldo cifrado fuera de Gmail y probar restauración antes de Production.

El informe semanal se envía por Resend al correo fijo configurado, con JSON y CSV sin alias de clientes. La fila `report_dispatches` reserva el envío para impedir duplicados; un estado `pending` tras fallo ambiguo exige comprobación manual antes de reintentar. `/api/cron/weekly` requiere `CRON_SECRET` y se ejecuta lunes 12:00 UTC (09:00 Montevideo). Los envíos reales de Preview requieren autorización específica y conciliación posterior; no repetir ante resultado incierto.

## Seguridad y límites

La app no ofrece alta pública, almacenamiento offline transaccional ni conciliación bancaria. La membresía se comprueba en cada endpoint de datos, exportación e informe; una identidad registrada sin membresía no puede usar datos financieros. Los roles `operator` y `admin` son internos; la gestión de membresías se realiza fuera de la app por una persona con acceso administrativo a Neon. Las rutas de Auth de Neon requieren configuración de dominios y proveedor en Neon. Una compilación local no demuestra sesiones, base, Gmail ni cron operativos; esas pruebas requieren la rama de ensayo y cuentas de prueba.

El paquete oficial `@neon/auth` 0.8.2 trae `@supabase/auth-js` como dependencia transitiva. Este proyecto no importa ese paquete, no usa Supabase como servicio y no contiene claves de Supabase. La dependencia transitiva del proveedor queda pendiente de eliminación por Neon si el criterio exige cero paquetes con ese nombre en el lockfile.
