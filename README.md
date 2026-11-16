# Cristal Sagrado · Registro

PWA privada para que Lucía registre consultas, ventas, cobros, devoluciones y gastos en pocos toques, y para enviar resúmenes estructurados a Gmail para auditorías de Diego/ChatGPT.

**Estado:** código MVP reforzado, pruebas de lógica aprobadas, sin dependencias instaladas ni credenciales de Supabase/Resend y **sin despliegue**. Proyecto Vercel reservado: `cristal-sagrado-registro` en equipo `daegon13s-projects`, ID `prj_kDrAYqml8JcQ8RSFPW3fbVuzpTtt`. No modifica la web pública.

## Arquitectura
- Next.js App Router / TypeScript / estilos propios mobile-first; PWA con manifiesto e iconos estándar y maskable (192/512 px).
- Supabase Auth (sin alta pública) y PostgreSQL con RLS por organización.
- Resend en API server-side para enviar informe resumido y CSV/JSON **sin datos personales de clientes**.
- Gmail es destino de auditoría y archivo; la base transaccional es Supabase.
- Zona horaria de cálculo `America/Montevideo` (UTC-03); dinero en UYU.

## Configuración en un entorno nuevo
1. Creá **un proyecto Supabase independiente**. No uses el de Smart Stock ni el de la web pública.
2. En **SQL Editor**, ejecutá **en orden** `sql/001_initial.sql` y `sql/002_hardening.sql`. El primero crea organizaciones, tablas y RLS; el segundo añade operaciones idempotentes, ajustes con motivo y auditoría.
3. En Authentication > Users, creá o invitá las cuentas de Lucía y Diego; deshabilitá el alta pública. Anotá los UUID de esos usuarios y ejecutá el bloque SQL del final del archivo para crear la organización y sus membresías. Nunca copies contraseñas al repositorio.
4. Verificá un dominio remitente en Resend; usá `REPORT_FROM_EMAIL` de ese dominio. El destinatario `REPORT_TO_EMAIL` debe ser el correo de Diego que quiera usar para auditorías.
5. Configurá en Vercel las variables `.env.example` (sin subir `.env` ni secretos a GitHub):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: son públicas, sujetas a RLS.
   - `SUPABASE_SERVICE_ROLE_KEY`: **secreto**; solo se utiliza en `app/api/reports/send/route.ts` del servidor. No prefijar con `NEXT_PUBLIC_`.
   - `RESEND_API_KEY`: secreto para el envío.
   - `REPORT_FROM_EMAIL`, `REPORT_TO_EMAIL`: direcciones. `REPORT_TO_EMAIL=damgmarin13@gmail.com` **ya está configurada** en este proyecto Vercel.
   - `CRON_SECRET`: secreto aleatorio fuerte, nunca expuesto al navegador; protege `/api/cron/weekly`.
   - `REPORT_ORG_ID`: UUID de la organización creado en el paso 3; evita que el cron envíe informes de otra organización.
6. Vinculá un repositorio GitHub **nuevo y privado**, independiente de `cristal-sagrado-site`, al proyecto Vercel que ya está creado. Subí el contenido de este ZIP allí y configurá Next.js con raíz del repo.
7. Instalá dependencias y probá: `npm install && npm run typecheck && npm test && npm run build && npm run dev`. En este entorno **sí** se ejecutó `npm test` con **6 casos aprobados**, pero no fue posible instalar npm (error de red), así que el typecheck de todo el proyecto y el build siguen pendientes.
8. Desde el Honor de Lucía, abrí la URL HTTPS protegida, iniciá sesión y elegí en Chrome «Agregar a pantalla principal» o «Instalar» cuando esté disponible. Los iconos 192/512 px ya están incluidos en el manifiesto. La app requiere conexión; no tiene almacenamiento transaccional offline.
9. Antes de usar datos reales, hacé las pruebas de `docs/PRUEBAS_Y_ENTREGA.md`; verificá políticas RLS con dos cuentas y el flujo de email. El cron está preparado en `vercel.json` para **lunes 12:00 UTC (09:00 Montevideo)** y solo se activa una vez configuradas sus variables.

**Importante:** la conexión del equipo Vercel ya se autorizó, pero la creación del proyecto no publica una aplicación. No hay URL funcional de registro hasta que el repositorio y las variables estén configurados y se realice el despliegue.

## Modelo contable
- `contacts`: cliente único o alias temporal, y origen inicial.
- `inquiries`: cada consulta; puede estar vinculada a un cliente existente. **Un evento no equivale a una persona única**.
- `sales`: servicio contratado e importe acordado. No es ingreso de caja.
- `payments`: cada cobro o devolución, vinculados a una venta; `idempotency_key` único.
- `expenses`: costo efectivamente asignado a la fecha del gasto (publicidad, materiales, comisiones, otros).
- `audit_log`: historial de inserciones y modificaciones para revisión.
- `report_dispatches`: registro de informes emitidos con SHA-256 para evitar un segundo envío idéntico desde la app.

**Métricas:** `cobrado neto = pagos - devoluciones`; `diferencia parcial = cobrado neto - gastos registrados`. Esto **no** representa beneficio fiscal, rentabilidad final ni conciliación bancaria. El gasto real de Meta se ingresa manualmente; sus recibos no son automáticamente gasto atribuido a esa semana.

## Estado de funciones
| Función | Estado en el código |
|---|---|
| Inicio de sesión privado | Implementado; requiere Supabase |
| Consultas rápidas IG | Implementado; requiere Supabase |
| Clientes y ventas | Implementado |
| Cobros y devoluciones | Implementado |
| Gastos manuales | Implementado |
| Vista de finanzas semanal | Implementado |
| Botón informe a Gmail JSON+CSV | Implementado; requiere Resend y claves servidor |
| Exportar respaldo JSON | Implementado en interfaz |
| Cron automático lunes | Código y cron definidos; **inactivo hasta configurar secretos y desplegar** |
| Importación automática Meta/Umami | Pendiente; no falsear atribuciones |
| Conciliación bancaria | Pendiente |
| Exportación histórica paginada >1000 registros | Pendiente; el sistema detecta truncamiento y se niega a informar cifras parciales |
| Edición de alias, anulación de cobros/gastos | Implementado en UI y SQL; pendiente de pruebas reales Supabase |
| Offline robusto | No implementado; necesita conexión |
| Iconos instalables PWA | Incluidos en PNG 192/512 + máscara |

## Seguridad
- Servidor comprueba JWT mediante `supabase.auth.getUser(token)` y membresía antes de usar la credencial de servicio en informes.
- Todas las consultas de informe se filtran por `org_id`; los datos personales (`alias`) no se transmiten en el correo.
- La base tiene RLS; operaciones sensibles requieren sesión válida y pertenencia a la organización.
- Para informes desde Gmail evitar datos identificables y usar una etiqueta `CS-FINANZAS`; nunca incluir fotos, nombres reales, teléfonos, fechas de nacimiento o conversaciones en adjuntos.
- Limitar manualmente destinatarios desde `REPORT_TO_EMAIL`; la interfaz nunca acepta correos arbitrarios.
- Crear respaldo cifrado fuera de Gmail, y comprobar restauración antes de operar con pagos reales.

## Limitaciones conocidas para salir a producción
- El MVP aún no está probado contra Supabase/Resend reales, ni compilado en este entorno porque npm no pudo acceder al registro para instalar dependencias.
- La UI solicita hasta 2000 registros por tabla, pero PostgREST puede aplicar un límite menor (frecuentemente 1000). El código compara el conteo total con lo recibido y **detiene** informes/métricas si hay truncamiento. Hay que implementar paginación para escalar.
- Las consultas ahora se registran con RPC transaccional y `idempotency_key` en `002_hardening.sql` para resistir reintentos. Es necesario verificarlo con dos dispositivos y condiciones de red reales.
- Las claves de idempotencia de cobros y gastos se conservan durante el formulario y se regeneran al abrir uno nuevo. Si el servidor guardó pero la respuesta se perdió, un reintento no debe duplicar el movimiento; puede mostrar un error de clave ya utilizada, por lo que hay que refrescar y verificar antes de insistir.
- Antes de manejar dinero real: probar y reforzar manejo de correcciones, doble envío y recuperación de sesiones.

## Integración con ChatGPT Work
Para finalizar instalación, credenciales y despliegue sin repetir esta especificación, cargá el ZIP en **Work** y entregá `docs/WORK_HANDOFF.md`. No compartas contraseñas ni claves en el chat; ingresalas en los paneles de Supabase, Resend y Vercel.
