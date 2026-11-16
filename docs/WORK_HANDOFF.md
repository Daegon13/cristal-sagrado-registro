# Transferencia a ChatGPT Work / Codex — Cristal Sagrado Registro

## Objetivo
Completar la instalación segura del MVP privado de Lu con Vercel, GitHub, Supabase Auth/Postgres y Resend; NO modificar la web pública de Cristal Sagrado, Umami, Smart Stock ni Mis Pagos.

## Estado verificado en este chat
- Proyecto Vercel existente `cristal-sagrado-registro` (teamId: `team_DzQBULryK406EaMVubH1CInH`, projectId: `prj_kDrAYqml8JcQ8RSFPW3fbVuzpTtt`). SIN despliegue.
- Variable `REPORT_TO_EMAIL` de Vercel YA creada: `damgmarin13@gmail.com` en development/preview/production.
- ZIP adjunto contiene Next.js + TypeScript, SQL inicial + endurecimiento, informes semanales, endpoint de cron, diseño PWA e iconos.
- No se instalaron dependencias npm por bloqueo de salida a registry.npmjs.org en esta sesión. Se verificó sintaxis transpileModule y pruebas de fechas, NO build completo ni E2E.
- El proyecto Supabase y las cuentas NO se crearon en este chat: no hay credenciales. Resend NO se configuró y NO se envió correo de prueba.

## Tareas ejecutables cuando tenga acceso autorizado
1. Crear repositorio GitHub NUEVO y PRIVADO, nombre `cristal-sagrado-registro`, dueño Diego. Importar el contenido de este ZIP preservando estructura. Nunca commitear .env. Configurar protección de main y checks.
2. Instalar dependencias, generar lockfile (`npm install`), correr `npm run typecheck`, `npm run test:dates`, `npm run build`. Corregir resultados; añadir tests DB/integración si hay entorno. Fijar dependencias y revisar `npm audit --omit=dev` antes del lanzamiento.
3. Crear proyecto Supabase independiente. Aplicar SQL en orden `sql/001_initial.sql`, `sql/002_hardening.sql` bajo migración revisada. Nunca usar una base preexistente de otras apps.
4. Desactivar registros públicos en Supabase Auth, crear dos cuentas autorizadas para Lu y Diego por invitación (sin guardar sus contraseñas en texto). Crear organización y memberships.
5. Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `CRON_SECRET`, `REPORT_ORG_ID`. `REPORT_TO_EMAIL` ya existe. No imprimir o copiar claves en informes.
6. Verificar remitente desde dominio que efectivamente esté autorizado en Resend; NO asumir que consulta@cristal-sagrado.com está habilitado. Prueba de informe solo a correo autorizado y con datos ficticios.
7. Vincular repo privado al Vercel projectId indicado. Primero desplegar Preview; probar login, RLS, idempotencia de consulta/cobro/gasto, anulación, historial, Gmail, CSV, cron y PWA Android; solo después promover a producción.
8. Validar que informes de Gmail estén anonimizados y que datos de clientes y credenciales no se filtran en el HTML, encabezados, logs ni exportaciones.
9. Implementar paginación de informes y UI antes de superar el límite por consulta de Supabase. El MVP actual falla con error explícito si hay filas recortadas, en vez de reportar cifras incompletas.
10. Comprobar recuperación de copia de seguridad antes de cualquier uso productivo. Preparar runbook de soporte/continuidad.

## Criterios de aceptación
- Nuevo cliente Instagram creado solo una vez con idempotency_key aun ante reintentos; dos consultas existentes no duplican contactos.
- Venta $U3000, seña $U1000 + saldo $U2000 = $U3000 cobrado; devolución real $U500 = neto $U2500.
- Cobro incorrecto anulado con motivo, auditoría y balance corregido; NUEVO asiento para importe correcto.
- Usuario no autorizado no puede leer, modificar ni enviar informes.
- Correo semanal lunes 09:00 Uruguay con JSON estructurado, CSV, hash y sin PII; la ausencia de movimientos genera importes cero reales, no inventados.
- Gastos Meta registrados por fecha real, sin duplicar cargos/recibos; distinguir origen manual de atribución verificada.
- Instalación PWA en Honor; búsqueda rápida de cliente; envío manual y cron compatible.

## Riesgos y verificaciones
- El servicio Supabase puede imponer límite de 1000 filas en PostgREST; el código falla de forma explícita cuando detecta datos truncados, no es solución completa. Implementar paginación para crecer.
- Reportes de correcciones retrospectivas generan nuevas versiones hash. Gmail es archivo de versiones, la BD es la fuente de verdad.
- Vercel Cron puede ejecutar con desviación en Hobby; el secreto CRON_SECRET protege el endpoint.
- Nunca confundir consultas, contrataciones y cobros. No presentar `diferencia parcial` como beneficio fiscal.
- NO publicar en producción hasta aprobar autenticación, seguridad RLS y pruebas financieras.
