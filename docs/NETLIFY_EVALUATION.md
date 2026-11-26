# Evaluación de Netlify Free · Cristal Sagrado Registro

**Fecha:** 25–26/11/2026 (America/Montevideo). **Rama Git:** `experiment/netlify-free` (`29727a4` al iniciar esta evaluación). **Sitio existente:** https://cristal-sagrado-registro.netlify.app. **Decisión actual:** **NO-GO para sustituir Vercel**; faltan pruebas del servicio publicado y de sus costos reales.

El 26/11 el propietario informó que ya agregó las variables en Netlify. La función aún devolvía `configured:false` y Netlify seguía sirviendo el deploy del 25/11; se necesita una publicación nueva para verificar que las variables estén disponibles en Functions. Esta afirmación del propietario no expone ni verifica sus valores.

## Alcance y estado

Esta evaluación usa el sitio Netlify ya creado. No modifica `main`, la PR #1, Neon Production ni Vercel Production. No activa informes, cron, Resend ni una migración definitiva. La rama experimental conserva `reportDeliveryDisabled = true` en `lib/experiment-policy.ts`; las rutas de envío y cron devuelven 503 antes de acceder al correo. `vercel.json` deshabilita los despliegues Git de esta rama en Vercel y no programa cron en Netlify.

| Área | Evidencia del 25/11 | Estado |
| --- | --- | --- |
| Código y Next.js | `next` 16.4.6, App Router, rutas `/api/*` dinámicas con runtime Node; `netlify.toml` fija Node 22, `npm run build` y `.next`. [Netlify documenta OpenNext y route handlers](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/). | Compatible en diseño; adaptador y build remoto sin inspeccionar |
| Rama publicada | Git remoto confirma `experiment/netlify-free` en `29727a4` y `main` en `170d560`. La API pública de Netlify del sitio existente identificó el deploy `6b0738374de0a9b550d03841` como `ready`, rama `experiment/netlify-free`, commit `29727a472cbb71f34535e793929d8e3df13f13c9`, publicado el 25/11/2026 a las 19:34:54 UTC. | Rama y commit exactos confirmados |
| Sitio y funciones | Inicialmente `GET /` y `/api/health` recibieron HTTP 401 de Netlify con `edge-access`. Tras cambiar la visibilidad, `/` y `/api/health` devolvieron 200, con `configured:false` y `Cache-Control: no-store` en health; `/api/me` y `/api/auth/get-session` devolvieron 503 de la app. Cron e informe devolvieron 503 con sus bloqueos experimentales. | Next.js y rutas API ejecutan; faltan variables para Auth y datos |
| Neon de ensayo | Rama `br-restless-breeze-b69gsedg`, padre Production, distinta de Preview; 12 tablas públicas. Se observaron marcadores de `003`, `004` y `005`: tablas base, columnas de Instagram y publicidad, `report_period_claims`, y columnas de revisión de despachos. | Esquema preparado; ningún intento de escritura HTTP |
| Neon Auth | La rama de ensayo acepta `https://cristal-sagrado-registro.netlify.app` como dominio confiable. Magic Link activo con alta pública desactivada; cero usuarios, sesiones y membresías QA. | Configuración comprobada; login, callback y cookies pendientes |
| Datos y correo | Dos organizaciones ficticias; cero despachos y reservas de informe. | Sin envío real |

La indicación **«Online, privately» sí impedía que Lucía accediera sin cuenta Netlify**: el 401 se generaba antes de la aplicación. Tras publicar la visibilidad, la URL quedó accesible sin cuenta Netlify. Según la [documentación de visibilidad de Netlify](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/), un sitio privado en Free solo es visible para el propietario. La autorización de datos debe seguir dependiendo de Neon Auth y de `memberships`, y debe comprobarse en vivo antes de usar el servicio.

## Funciones y seguridad: comprobado y pendiente

**Comprobado localmente:** `npm ci` instaló 68 paquetes y auditó 69 sin vulnerabilidades reportadas; `npm run typecheck` pasó; `npm test` pasó 16/16; `npm run build` pasó y marcó `/api/auth`, `/api/data`, `/api/export`, `/api/me`, informes y cron como dinámicas. Playwright sobre `next start` a 390 × 844 px: 8 tests aprobados y 1 captura histórica omitida. El mismo E2E, ahora apuntando a la URL Netlify, obtuvo 8 aprobados y 1 omisión. El E2E de consulta → venta → cobro, búsquedas con 100/300/500 contactos, publicidad e interfaz de informes usa respuestas API simuladas; **no demuestra persistencia en Netlify**. El guard remoto confirmó 503 en `/api/reports/send` y `/api/cron/weekly`.

**Pendiente en Netlify:** build y logs de OpenNext, `configured:true` en `/api/health`, rutas Auth y de datos con secretos configurados, inicio y cierre de sesión, persistencia tras recargar, cookies `Secure`/`HttpOnly`, Magic Link y su retorno al dominio, rechazos 401/403 de sesión y membresía, aislamiento entre organizaciones, duplicación de claves de idempotencia y protección financiera. El POST `/api/data` con origen ajeno sí devolvió 403 en la URL remota, antes de escribir. Sin credenciales, `/api/data?table=contacts` y `/api/export?format=json` devolvieron 503 por configuración pendiente; aún no es un ensayo del rechazo 401. No hay evidencia remota de errores de compilación, runtime, cookies o redirecciones del flujo autenticado; tampoco se pueden descartar. El `DATABASE_URL` de la app debe apuntar exclusivamente a la rama Neon de ensayo. `configured:false` confirma que falta al menos una de las tres variables requeridas en el runtime de Netlify, sin identificar cuál.

Al habilitar la prueba, usar solo usuarios y datos ficticios. Verificar `GET /api/me`, búsquedas, altas y exportaciones para dos usuarios con organizaciones distintas y una identidad sin membresía; repetir claves de idempotencia y referencias cruzadas. Confirmar cero filas nuevas en `report_dispatches` y que cron/envío siguen en 503. No enviar correos reales, incluidos informes, ni activar Scheduled Functions. La verificación de Magic Link requiere una dirección QA autorizada y una entrega de Auth; la configuración de dominio por sí sola no prueba el callback.

## Flujo funcional

La prueba local de UI cubrió consulta de Instagram → selección de cliente → venta → cobro, búsqueda con 100/300/500 contactos y vistas de campaña, gasto y presupuesto. Los tests SQL locales cubrieron organizaciones, idempotencia, anulación, auditoría y devolución. En Netlify siguen pendientes el flujo HTTP autenticado completo, búsqueda por `@Instagram`, varias consultas del mismo cliente, presupuesto y gasto por período, devolución, anulación, JSON/CSV, resumen financiero y persistencia tras recargar. La muestra SQL ficticia de la rama Neon existe, pero no reemplaza esas pruebas de la aplicación.

## Rendimiento Netlify frente a Vercel

El despliegue Preview de Vercel del commit `57d1c5a` figuró `READY` en la cuenta conectada el 25/11. No se obtuvo una sesión QA equivalente ni acceso a datos en Netlify. Durante la barrera privada se observaron **242 ms** para `GET /` y **171 ms** para `GET /api/health`, ambos HTTP 401; miden red y control de acceso, no la app. Tras abrir el sitio se tomaron cinco muestras secuenciales desde este equipo con `curl` (tiempo HTTP total, red incluida): `GET /` **335 ms de mediana** (188–578 ms, 6.944 bytes) y `/api/health` **365 ms de mediana** (324–505 ms, 71 bytes). Son respuestas sin sesión ni consultas a Neon. No son una comparación válida con Vercel ni una medición de arranque en frío; tampoco separan ejecución de servidor y latencia de red.

| Operación solicitada | Netlify (ms) | Vercel Preview (ms) | Motivo |
| --- | ---: | ---: | --- |
| Primera carga; carga con sesión | Página pública sin sesión: mediana 335 ms (5 muestras); carga con sesión pendiente | Sin medición comparable | Falta sesión QA en ambos entornos |
| Búsqueda con 100, 300 y 500 contactos | Sin medición válida | Sin medición comparable | Sin sesiones y poblaciones QA equivalentes |
| Registro de consulta, venta y cobro | Sin medición válida | Sin medición comparable | Sin escritura HTTP autenticada en Netlify |
| Resumen financiero | Sin medición válida | Sin medición comparable | Sin sesión en ambos entornos |

Cuando el acceso esté disponible, medir desde la misma red y franja horaria varias muestras por operación, con dos calentamientos y al menos una muestra tras inactividad si es posible. Registrar mediana, p95, errores, tamaño de respuesta y condiciones de frío. Separar navegación completa de latencia HTTP; atribuir tiempo a servidor o SQL solo si se dispone de trazas fiables. Las cifras del E2E local con API simulada no son rendimiento de alojamiento.

## Costos de Netlify Free

Las tarifas actuales para cuentas **Credit-based Free** son [300 créditos por ciclo y corte duro](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/): 15 por despliegue exitoso a la URL principal, 10/GB-h de Functions, 20/GB de transferencia saliente y 2/10.000 solicitudes web. Los branch deploys y Deploy Previews cuestan 0 créditos de despliegue. La memoria predeterminada de Functions es [1 GB](https://docs.netlify.com/build/functions/usage-and-billing/). No se pudo consultar el plan ni el contador real de la cuenta; si es Legacy, esta estimación no aplica directamente.

Para dos usuarios, 20–100 registros mensuales y uso diario, el número de registros no determina por sí solo el costo: importan consultas, tiempo de función, transferencia y publicaciones. Con 1 GB facturado por función y **un** deploy principal mensual:

| Escenario ilustrativo | Compute | Transferencia | Requests | Deploy | Total aproximado |
| --- | ---: | ---: | ---: | ---: | ---: |
| 6.000 invocaciones × 1 s; 0,5 GB; 6.000 requests | 16,7 | 10 | 1,2 | 15 | **42,9 créditos** |
| 20.000 invocaciones × 2 s; 2 GB; 20.000 requests | 111,1 | 40 | 4 | 15 | **170,1 créditos** |

Son supuestos, no consumo observado. Cada push que publique un *production deploy* exitoso añade 15 créditos: **20 despliegues consumen los 300 créditos antes de contar tráfico**. El saldo se comparte con otros sitios del equipo y al agotarse [todos pueden quedar pausados](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/). Registrar en el panel plan, saldo inicial y final, despliegues, Functions y tráfico antes de decidir. No contratar un plan pago para esta prueba.

## Acciones manuales y decisión

1. **Realizado:** el production deploy del sitio Netlify existente quedó público y `/api/health` dejó de mostrar `edge-access`. El login financiero seguirá siendo de la app; comprobarlo al configurar los secretos.
2. En **Project configuration → Environment variables**, añadir con alcance **Builds y Functions**: `DATABASE_URL` (cadena **pooled** de `br-restless-breeze-b69gsedg`), `NEON_AUTH_BASE_URL` (`https://ep-late-firefly-b6uish7j.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth`) y `NEON_AUTH_COOKIE_SECRET` (valor nuevo, aleatorio, de al menos 32 caracteres). No compartir valores secretos, usar `NEXT_PUBLIC_` ni ponerlos en Git. Republicar solo `experiment/netlify-free` si cambian variables.
3. **Confirmado:** la API pública de Netlify muestra `experiment/netlify-free` y el commit `29727a4` como deploy publicado `ready`. En **Deploys**, revisar todavía build log, función OpenNext y errores. En **Usage/Billing**, anotar el plan y el consumo; no cambiar a un plan pago.
4. Con el sitio accesible, completar las pruebas HTTP autenticadas, móviles, de datos y latencia descritas arriba. Crear identidades QA únicamente en la rama Neon de ensayo y no vincularlas por correo recibido del navegador.

**Veredicto: NO-GO para sustitución definitiva de Vercel.** La URL pública y las rutas Next.js básicas ya funcionan en Netlify; faltan la configuración efectiva de Neon, el flujo autenticado y financiero real, el aislamiento de datos, la comparación de velocidad y el consumo medido. Mantener Vercel como referencia hasta que esos gates pasen; este veredicto no autoriza migrar Production.
