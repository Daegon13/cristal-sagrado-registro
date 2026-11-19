# Cristal Sagrado · Registro

Aplicación privada para consultas, clientes, ventas, cobros, devoluciones, gastos e informes semanales en UYU. Next.js 16, Neon PostgreSQL y Neon Managed Better Auth. La interfaz conserva el flujo móvil de Lu y la PWA. Los datos financieros se consultan y modifican en el servidor con SQL parametrizado; el navegador nunca recibe credenciales Postgres.

**Estado:** Preview de `feat/neon-migration` conectado a su rama aislada de Neon, con migración `003`, dos identidades administrativas y membresías reales. El flujo financiero ficticio pasó por HTTP. Faltan los accesos reales de ambas personas, el correo de Resend y la restauración del respaldo. No usar con datos reales hasta pasar la prueba integral. Ver [estado de aceptación](docs/NEON_ACCEPTANCE_2026-11-19.md) y [configuración](docs/NEON_SETUP.md).

## Instalación

1. Crear proyecto y rama Neon exclusivos. Habilitar Managed Better Auth. Aplicar **solo** `sql/003_neon_initial.sql` a la rama vacía. Los scripts `001` y `002` son históricos de Supabase y no se ejecutan en Neon.
2. Crear administrativamente las identidades de Lucía y Diego en Neon Auth. Crear organización y `memberships` con sus IDs reales como explica `docs/NEON_SETUP.md`. El registro público se bloquea en el proxy de la app; la URL directa de Neon Auth requiere revisión de configuración por separado.
3. Configurar secretos de `.env.example` en servidor o Vercel. `DATABASE_URL`, `NEON_AUTH_BASE_URL` y `NEON_AUTH_COOKIE_SECRET` deben apuntar a la **misma rama de ensayo**. No usar variables `NEXT_PUBLIC_` para secretos. `REPORT_TO_EMAIL` es fijo; no se acepta destinatario del navegador.
4. Ejecutar `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, y `npm run dev`. Abrir `/api/health` para verificar `configured`. Sin variables, la pantalla indica configuración pendiente.

## Modelo contable

`sales.agreed_amount` representa venta comprometida, no dinero recibido. `payments` almacena cobros y devoluciones; una anulación conserva el asiento y registra autor, motivo y momento. `expenses` representa gasto manual. Los importes son `numeric(12,2)` y los informes calculan en centésimos UYU. La diferencia entre neto cobrado y gastos registrados no es beneficio fiscal ni conciliación bancaria. La fuente de un contacto es declarada, no atribución verificada de Meta.

Cada operación sensible verifica sesión y membresía en servidor. Las claves foráneas compuestas `(org_id,id)` impiden referencias entre organizaciones. Las operaciones repetibles tienen claves de idempotencia; contacto y consulta se crean en una transacción. Las listas se recuperan en páginas y el informe calcula sobre todas las filas del período en la base, sin límite PostgREST. El respaldo JSON autenticado incluye todas las tablas de la organización, auditorías y envíos; `/api/export?format=csv` exporta movimientos. Conservar el respaldo cifrado fuera de Gmail y probar restauración antes de Production.

El informe semanal se envía por Resend al correo fijo configurado, con JSON y CSV sin alias de clientes. La fila `report_dispatches` reserva el envío para impedir duplicados; un estado `pending` tras fallo ambiguo exige comprobación manual antes de reintentar. `/api/cron/weekly` requiere `CRON_SECRET` y se ejecuta lunes 12:00 UTC (09:00 Montevideo). No habilitar correo real en Preview de pruebas.

## Seguridad y límites

La app no ofrece alta pública, almacenamiento offline transaccional ni conciliación bancaria. La membresía se comprueba en cada endpoint de datos, exportación e informe; una identidad registrada sin membresía no puede usar datos financieros. Los roles `operator` y `admin` son internos; la gestión de membresías se realiza fuera de la app por una persona con acceso administrativo a Neon. Las rutas de Auth de Neon requieren configuración de dominios y proveedor en Neon. Una compilación local no demuestra sesiones, base, Gmail ni cron operativos; esas pruebas requieren la rama de ensayo y cuentas de prueba.

El paquete oficial `@neon/auth` 0.8.2 trae `@supabase/auth-js` como dependencia transitiva. Este proyecto no importa ese paquete, no usa Supabase como servicio y no contiene claves de Supabase. La dependencia transitiva del proveedor queda pendiente de eliminación por Neon si el criterio exige cero paquetes con ese nombre en el lockfile.
