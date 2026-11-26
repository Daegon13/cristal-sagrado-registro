# Ensayo Netlify Free · Registro

> Actualización del 25/11/2026: el sitio `https://cristal-sagrado-registro.netlify.app` ya existe. Los pasos originales de creación de sitio que siguen abajo son históricos y no deben repetirse. La evaluación vigente y las acciones pendientes están en [NETLIFY_EVALUATION.md](NETLIFY_EVALUATION.md).

Estado al 24/11/2026 (America/Montevideo): **preparado localmente; despliegue Netlify y aceptación autenticada pendientes**. Esta rama no cambia `main`, la PR #1 ni el proyecto Vercel. La rama Git `experiment/netlify-free` parte de `feat/neon-migration` en `57d1c5a`.

La sesión de trabajo no dispone de una conexión autenticada a una cuenta Netlify; el sitio, sus secretos y la medición de créditos requieren los pasos manuales siguientes. La rama Git ya está publicada como `origin/experiment/netlify-free`.

## Implementación y límites de la prueba

- `netlify.toml` usa Node 22, `npm run build` y publica `.next`. Netlify aplica automáticamente su adaptador oficial OpenNext para Next.js 13.5+; no se fija el plugin antiguo. La aplicación sigue usando SSR y rutas API, sin `output: 'export'`. Verificar en el log remoto que el adaptador haya generado la función de Next.js y sus rutas.
- `lib/experiment-policy.ts` desactiva de forma fija el envío de informes en esta rama. La interfaz lo indica y deshabilita sus botones; `/api/reports/send` y `/api/cron/weekly` responden 503 antes de procesar un envío. `sendReport` también corta antes de llamar a Resend. No configurar `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `REPORT_TO_EMAIL`, `CRON_SECRET` ni `REPORT_ORG_ID` en Netlify; no crear Scheduled Functions. `vercel.json` pertenece a Vercel y no programa tareas en Netlify.
- El `vercel.json` de **esta rama** deshabilita despliegues Git de `experiment/netlify-free` en el proyecto Vercel conectado. No se cambió la configuración remota ni la rama productiva. Confirmar tras el push que no apareció un nuevo Preview Vercel para este commit.
- La lectura de estado e historial de informes queda disponible con sesión y membresía. Exportaciones JSON/CSV siguen en las rutas Next.js existentes. Se debe confirmar su respuesta en Netlify con una cuenta ficticia antes de dar por aceptado el alojamiento.

## Neon: rama exclusiva ya creada

Proyecto `cristal-sagrado-registro` (`little-credit-80176183`), región `aws-sa-east-1`. La rama **`experiment/netlify-free`**, ID `br-restless-breeze-b69gsedg`, se creó desde `production` (`br-mute-cake-b6lh2rom`), no desde `preview/feat/neon-migration` (`br-shy-salad-b6nmhtc9`). Antes de migrar estaba `ready`, con 0 tablas públicas, 0 usuarios Auth y 0 sesiones. Se aplicaron, cada una en una transacción y solo en esa rama, `003_neon_initial.sql`, `004_daily_register.sql` y `005_report_period_idempotency.sql`. Después había 12 tablas públicas y `report_snapshot`; no repetir estas migraciones.

Neon Auth en esa rama usa `NEON_AUTH_BASE_URL=https://ep-late-firefly-b6uish7j.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth`. Se verificó **alta pública por contraseña desactivada** y Magic Link habilitado con `disable_sign_up=true` y 15 minutos de vigencia. El origen de Netlify aún no figura entre los dominios de confianza porque no hay URL Netlify. No se generó ni envió ningún enlace.

Se cargó una muestra **ficticia directamente en SQL**: dos organizaciones QA, una consulta, una venta por 2500 UYU, cobros por 1000 y 1500, devolución por 500, un cobro erróneo de 100 anulado, una campaña, un gasto Meta y un gasto material. El saldo neto vigente es 2000 UYU, hay 11 eventos de auditoría para la organización A, 0 despachos y 0 usuarios Auth. La organización B tiene 0 movimientos financieros. Las pruebas de referencia cruzada, devolución por encima del saldo y clave de idempotencia repetida fueron rechazadas por la base. **Estas comprobaciones SQL no prueban las rutas HTTP ni el aislamiento de sesión de la app.**

## Configuración manual para publicar el sitio de ensayo

1. En Netlify, confirmar que la cuenta está en **Free de créditos** (300 créditos por ciclo y límite duro). Si la cuenta es Legacy, consultar su panel: no convertirla de plan para esta prueba. Crear **un sitio nuevo** para `Daegon13/cristal-sagrado-registro`, con nombre inequívoco de ensayo, sin dominio personalizado. Elegir `experiment/netlify-free` como rama de publicación del sitio de ensayo; no seleccionar `main` ni `feat/neon-migration`. Así se obtiene una URL estable `https://<nombre>.netlify.app` para Auth. Un despliegue exitoso al dominio principal de este nuevo sitio puede consumir 15 créditos; registrar el saldo antes y después. No conectar el proyecto productivo de Vercel.
2. Confirmar el commit exacto y `netlify.toml`: comando `npm run build`, directorio `.next`, Node 22, adaptador OpenNext en el log. No seleccionar exportación estática. Restringir las publicaciones automáticas a la rama experimental o desactivarlas después del primer despliegue para evitar gasto innecesario.
3. En **la rama Neon `br-restless-breeze-b69gsedg`**, obtener la cadena `DATABASE_URL` **pooled** para la app. Ponerla como secreto de Netlify con alcance **Builds y Functions**; nunca en `NEXT_PUBLIC_`, Git ni logs. Poner también `NEON_AUTH_BASE_URL` de arriba y un `NEON_AUTH_COOKIE_SECRET` nuevo, aleatorio, de al menos 32 caracteres, con ambos alcances. Netlify no expone a funciones las variables declaradas solo en `netlify.toml`. No reutilizar la cadena de Production o Vercel Preview. Verificar que `/api/health` devuelve `configured:true` y `Cache-Control: no-store` en el sitio Netlify.
4. Añadir el origen **exacto** `https://<nombre>.netlify.app` a *Trusted domains* de Neon Auth **solo en la rama experimental**. Revisar que el alta directa continúa cerrada. Mantener el correo compartido de Auth solo como configuración de ensayo; esta ejecución no envía correos. Para comprobar Magic Link y cookies se necesitaría autorizar más adelante una cuenta ficticia y un envío de Auth; hasta entonces marcar esas pruebas como pendientes, no como aprobadas. La cookie debe ser `Secure`/`HttpOnly` en HTTPS y sostener una sesión al recargar y navegar. El navegador interno de Gmail y un navegador externo deben evaluarse por separado.
5. Crear administrativamente usuarios QA ficticios en la rama de Neon Auth, sin altas públicas ni correos a personas reales. Vincular sus **IDs Auth reales** mediante `memberships` a las dos organizaciones QA ya cargadas, una por usuario. Probar también una tercera identidad sin membresía. Antes de cualquier ensayo HTTP, confirmar `SELECT id,name FROM organizations ORDER BY name` y que solo aparecen las dos organizaciones ficticias en esta rama. No crear membresías por email enviado desde el navegador.

## Aceptación HTTP pendiente en la URL Netlify

Usar exclusivamente las organizaciones y usuarios QA. Registrar respuesta, hora y captura sin tokens ni datos de contacto. En ambas sesiones, comprobar consultas, búsqueda de clientes, venta vinculada, seña, saldo, devolución, anulación con motivo, campaña, gasto Meta, exportaciones JSON y CSV y auditoría. Repetir las mismas claves de idempotencia y confirmar una sola fila. Alterar `orgId`, `contactId`, `saleId` y `campaignId` hacia la otra organización: lectura, escritura, exportación y estado de informe deben devolver 403 o no revelar filas. Sin sesión debe devolver 401. El informe puede consultarse, pero los dos endpoints de envío y cron deben devolver 503 y `report_dispatches` debe permanecer en 0. No probar un correo real.

En pantalla de 390 px, ejecutar los E2E de este repositorio con `PREVIEW_ACCESS_URL` apuntando al ensayo y `EXPERIMENT_GUARD_URL` a la misma URL. Los E2E de `preview.spec.ts` interceptan API y **solo prueban la UI**; la aceptación HTTP autenticada anterior es una prueba separada. No apuntar el guard de 503 al Preview de Vercel.

## Rendimiento: comparación pendiente

El Preview actual de Vercel en `feat/neon-migration`, commit `57d1c5a`, figuraba `READY` y `/api/health` devolvió 200 con `configured:true` el 24/11. No se midió latencia transaccional comparable: falta el sitio Netlify y sesiones QA equivalentes. Para medir desde un equipo en Uruguay, en la misma conexión y franja horaria:

1. Preparar el mismo volumen de **datos ficticios** en ambas ramas QA, sin tocar la organización real del Preview. Usar sesiones QA separadas y verificar que cada entorno apunta a su propia rama Neon.
2. Por host, medir 20 ejecuciones después de 2 calentamientos de `contact_search` (100, 300 y 500 contactos), lectura de consultas, alta de consulta, venta y cobro. Para escrituras, usar claves de idempotencia únicas y datos QA; no repetir una mutación solo para medir si su respuesta es incierta. Registrar mediana, p95, tamaño de respuesta, fallos y si el primer acceso despertó el compute Neon.
3. Registrar por separado tiempo de navegación de 390 px y tiempo de API en DevTools/Playwright; no mezclar red, UI y base. Comparar Netlify frente a Vercel en la **misma clase de operación** y con la misma cantidad de filas. Registrar origen de medición, fecha y región indicada por los encabezados de cada proveedor.

| Operación | Netlify mediana / p95 | Vercel mediana / p95 | Estado |
| --- | --- | --- | --- |
| Búsqueda de clientes | pendiente | pendiente | Sin URL Netlify ni sesión comparable |
| Consultas | pendiente | pendiente | Sin sesión comparable |
| Ventas | pendiente | pendiente | Sin sesión comparable |
| Cobros | pendiente | pendiente | Sin sesión comparable |

## Créditos y margen Free

Según [Netlify, créditos por uso](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), los despliegues a la URL principal cuestan 15 créditos exitosos; Branch Deploys y Deploy Previews, 0; Functions, 10 créditos/GB-h; tráfico saliente, 20 créditos/GB; peticiones, 2 créditos/10.000. [Free de créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) incluye 300 créditos/mes con corte duro. La tarifa real de la cuenta puede ser Legacy y el saldo se comparte con otros sitios del equipo: comprobar el panel antes del despliegue.

Estimación ilustrativa para **dos usuarios habituales**, suponiendo 1 GB de memoria facturada por función y sin otros sitios, IA ni formularios:

| Escenario mensual | Funciones | Transferencia | Peticiones | Despliegue principal | Total aprox. | Margen de 300 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 6.000 peticiones de 1 s; 0,5 GB salientes | 16,7 | 10 | 1,2 | 15 | **42,9** | **257,1** |
| 20.000 peticiones de 2 s; 2 GB salientes | 111,1 | 40 | 4 | 15 | **170,1** | **129,9** |

Fórmula: `créditos = 15 × deploys principales + 10 × (peticiones a Functions × GB facturados × segundos / 3600) + 20 × GB salientes + 2 × peticiones web / 10000`. Las peticiones estáticas también cuentan como web, pero no necesariamente como Function. Son **supuestos**, no consumo medido. Tomar del panel Netlify el saldo inicial/final y el desglose de Functions, ancho de banda y requests tras la prueba; recalcular el margen con la duración y memoria reales.

**Comparación con Vercel:** el Preview verificado está `READY` y funcional en `/api/health`, pero no se obtuvo el plan, el consumo facturado ni una muestra de latencia equivalente de Vercel. Por eso no hay una diferencia de costo mensual ni de rendimiento medida que permita elegir proveedor. El límite duro de Netlify Free evita cargos automáticos y también puede detener el servicio al agotar créditos; esta consecuencia debe valorarse con el consumo real del equipo.

## Evidencia local y decisión

`npm ci`: 69 paquetes auditados, 0 vulnerabilidades. `npm run typecheck`: pasó. `npm test`: 16/16. `npm run build`: pasó; rutas Auth, datos, exportación, informes y cron marcadas dinámicas. E2E local a 390 px: 8 pasaron, 1 captura histórica omitida; usa API simulada salvo la comprobación HTTP real de los bloqueos 503. La prueba SQL en Neon pasó con datos ficticios. **No hay build de Netlify, Magic Link, cookies, aislamiento HTTP autenticado, latencias ni créditos reales verificados.** La decisión de alojamiento sigue abierta; Vercel permanece activo y no hay migración definitiva.
