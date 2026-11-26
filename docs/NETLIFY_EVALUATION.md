# Evaluación de Netlify Free · Cristal Sagrado Registro

**Fecha:** 25–26/11/2026 (America/Montevideo). **Rama Git:** `experiment/netlify-free` (`29727a4` al iniciar esta evaluación). **Sitio existente:** https://cristal-sagrado-registro.netlify.app. **Decisión actual:** **NO-GO para sustituir Vercel**; faltan pruebas del servicio publicado y de sus costos reales.

El 26/11 el propietario informó que agregó las variables en Netlify. Se publicó el commit documental `d5b1193` en la misma rama para activar el redeploy automático. El nuevo deploy quedó `ready` y `/api/health` pasó a `configured:true`. Esto verifica que las tres variables existen en el runtime, pero no demuestra que apunten a la rama correcta. El esquema público de `/api/auth/open-api/generate-schema` reveló que `NEON_AUTH_BASE_URL` apunta al Auth del Preview de Vercel; se requiere corregirlo en Netlify y republicar antes de iniciar sesiones.

## Alcance y estado

Esta evaluación usa el sitio Netlify ya creado. No modifica `main`, la PR #1, Neon Production ni Vercel Production. No activa informes, cron, Resend ni una migración definitiva. La rama experimental conserva `reportDeliveryDisabled = true` en `lib/experiment-policy.ts`; las rutas de envío y cron devuelven 503 antes de acceder al correo. `vercel.json` deshabilita los despliegues Git de esta rama en Vercel y no programa cron en Netlify.

| Área | Evidencia al 26/11 | Estado |
| --- | --- | --- |
| Código y Next.js | `next` 16.4.6, App Router, rutas `/api/*` dinámicas con runtime Node; `netlify.toml` fija Node 22, `npm run build` y `.next`. [Netlify documenta OpenNext y route handlers](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/). | Build remoto `ready` y rutas ejecutándose; log del adaptador sin inspeccionar |
| Rama publicada | La API pública de Netlify identificó el deploy actual `6b087465df45bc67365cfa7a` como `ready`, contexto `production`, rama `experiment/netlify-free`, commit `d5b1193636bbe527ba1c66fb96782e626a93e881`, publicado el 26/11/2026 a las 18:03:44 UTC. El anterior era `29727a4`; no se sirvió `main`. | Rama y commit exactos confirmados |
| Sitio y funciones | `/` y `/api/health` devuelven 200; health indica `configured:true` y `Cache-Control: no-store`. `/api/auth/get-session` devuelve 200 con `null` sin sesión, con respuesta del proxy Neon. `/api/me`, datos y exportación devuelven 401 sin sesión. Cron e informe devuelven 503. | Next.js, rutas API y proxy Auth ejecutan; acceso autenticado pendiente |
| Neon de ensayo | Rama `br-restless-breeze-b69gsedg`, padre Production, distinta de Preview; 12 tablas públicas. Se observaron marcadores de `003`, `004` y `005`: tablas base, columnas de Instagram y publicidad, `report_period_claims`, y columnas de revisión de despachos. | Esquema preparado; ningún intento de escritura HTTP |
| Neon Auth | La rama de ensayo acepta `https://cristal-sagrado-registro.netlify.app` como dominio confiable. Magic Link activo con alta pública desactivada; cero usuarios, sesiones y membresías QA. Un login ficticio en Netlify falla con `INVALID_ORIGIN`. El OpenAPI remoto identifica el endpoint Auth de Preview de Vercel. | Inicio de sesión bloqueado por URL Auth incorrecta |
| Datos y correo | Dos organizaciones ficticias; cero despachos y reservas de informe. | Sin envío real |

La indicación **«Online, privately» sí impedía que Lucía accediera sin cuenta Netlify**: el 401 se generaba antes de la aplicación. Tras publicar la visibilidad, la URL quedó accesible sin cuenta Netlify. Según la [documentación de visibilidad de Netlify](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/), un sitio privado en Free solo es visible para el propietario. La autorización de datos debe seguir dependiendo de Neon Auth y de `memberships`, y debe comprobarse en vivo antes de usar el servicio.

## Funciones y seguridad: comprobado y pendiente

**Comprobado localmente:** `npm ci` instaló 68 paquetes y auditó 69 sin vulnerabilidades reportadas; `npm run typecheck` pasó; `npm test` pasó 16/16; `npm run build` pasó y marcó `/api/auth`, `/api/data`, `/api/export`, `/api/me`, informes y cron como dinámicas. Playwright sobre `next start` a 390 × 844 px: 8 tests aprobados y 1 captura histórica omitida. El mismo E2E, apuntando a la URL Netlify, obtuvo 8 aprobados y 1 omisión. Ese E2E de consulta → venta → cobro, búsquedas con 100/300/500 contactos, publicidad e interfaz de informes usa respuestas API simuladas; **no demuestra persistencia en Netlify**. Una nueva prueba `e2e/netlify-public.spec.ts` sin APIs simuladas pasó en Chrome a 390 px: login visible, sin desborde horizontal ni errores de página, health configurado y tres rutas protegidas con 401/no-store. El guard remoto confirmó 503 en `/api/reports/send` y `/api/cron/weekly`.

**Pendiente en Netlify:** logs de OpenNext, confirmación de que `DATABASE_URL` corresponde a la rama de ensayo, inicio y cierre de sesión, persistencia tras recargar, cookies `Secure`/`HttpOnly`, Magic Link y su retorno al dominio, rechazo 403 de identidad sin membresía, aislamiento entre organizaciones, duplicación de claves de idempotencia y protección financiera. El POST `/api/data` con origen ajeno devolvió 403; el alta pública `/api/auth/sign-up/email` devolvió 403, antes de crear usuarios. No hay evidencia remota de errores de compilación o runtime en las rutas públicas probadas; cookies y redirecciones del flujo autenticado siguen sin comprobarse. `configured:true` confirma presencia de las tres variables, no la identidad de la base ni el valor correcto de cada una.

**Bloqueo de Auth detectado el 26/11:** un login por contraseña con identidad ficticia inexistente devolvió `403 INVALID_ORIGIN` a través de `/api/auth/sign-in/email`, tanto por HTTP directo como desde Chrome. La misma solicitud al Auth de la rama de ensayo devolvió 401 por credenciales inválidas; al Auth del Preview de Vercel devolvió 403 para el origen Netlify. Finalmente, `/api/auth/open-api/generate-schema` en Netlify anunció como `servers.url` `https://ep-small-tooth-b6n0ag36.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth`, que es la URL Auth de Preview. **Causa confirmada: `NEON_AUTH_BASE_URL` de Netlify apunta a Preview.** Debe cambiarse a la URL Auth de la rama Netlify y republicarse. El test remoto añadido conserva esta regresión y actualmente falla 1/2; la prueba pública sin login pasa. No se envió correo ni se escribió en la base.

Se añadió un guard de aislamiento a la rama experimental: `/api/health` solo marca `configured:true` si el hostname de `DATABASE_URL` es el endpoint pooled de ensayo, la URL Auth es la de ensayo y el secreto de cookie tiene al menos 32 caracteres. La ruta Auth, el acceso a datos y la apertura del pool aplican el mismo control antes de usar credenciales o escribir. Esta corrección pasó 17/17 tests locales, typecheck y build; su comportamiento remoto se verifica tras el siguiente deploy.

Usar solo usuarios y datos ficticios. Verificar `GET /api/me`, búsquedas, altas y exportaciones para dos usuarios con organizaciones distintas y una identidad sin membresía; repetir claves de idempotencia y referencias cruzadas. Confirmar cero filas nuevas en `report_dispatches` y que cron/envío siguen en 503. No enviar informes ni activar Scheduled Functions. El propietario autorizó únicamente Magic Links de Auth a una casilla QA bajo su control; aún falta la dirección. La configuración de dominio por sí sola no prueba el callback.

## Flujo funcional

La prueba local de UI cubrió consulta de Instagram → selección de cliente → venta → cobro, búsqueda con 100/300/500 contactos y vistas de campaña, gasto y presupuesto. Los tests SQL locales cubrieron organizaciones, idempotencia, anulación, auditoría y devolución. En Netlify siguen pendientes el flujo HTTP autenticado completo, búsqueda por `@Instagram`, varias consultas del mismo cliente, presupuesto y gasto por período, devolución, anulación, JSON/CSV, resumen financiero y persistencia tras recargar. La muestra SQL ficticia de la rama Neon existe, pero no reemplaza esas pruebas de la aplicación.

## Rendimiento Netlify frente a Vercel

El despliegue Preview de Vercel del commit `57d1c5a` figuró `READY` en la cuenta conectada el 25/11. No se obtuvo una sesión QA equivalente ni acceso a datos en Netlify. Durante la barrera privada se observaron **242 ms** para `GET /` y **171 ms** para `GET /api/health`, ambos HTTP 401; miden red y control de acceso, no la app. Tras abrir el sitio se tomaron cinco muestras secuenciales desde este equipo con `curl` (tiempo HTTP total, red incluida): `GET /` **335 ms de mediana** (188–578 ms, 6.944 bytes) y `/api/health` **365 ms de mediana** (324–505 ms, 71 bytes). Son respuestas sin sesión ni consultas a Neon. No son una comparación válida con Vercel ni una medición de arranque en frío; tampoco separan ejecución de servidor y latencia de red.

En el deploy configurado del 26/11 se repitieron cinco muestras por ruta, desde el mismo equipo: `/` 200, **315 ms de mediana** (149–407); `/api/health` 200, **299 ms** (293–524); `/api/me` sin sesión 401, **488 ms** (415–748). Tiempo HTTP total de `curl`, con red; `/api/me` comprueba Auth sin membresía y no llega a consultar datos financieros. No se observaron métricas de ejecución de Function o SQL que permitan separar sus latencias.

| Operación solicitada | Netlify (ms) | Vercel Preview (ms) | Motivo |
| --- | ---: | ---: | --- |
| Primera carga; carga con sesión | Página pública sin sesión: mediana 315 ms (5 muestras el 26/11); carga con sesión pendiente | Sin medición comparable | Falta sesión QA en ambos entornos |
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
2. **Corrección requerida:** `NEON_AUTH_BASE_URL` en Netlify apunta a Preview. Cambiarlo en **Project configuration → Environment variables** a `https://ep-late-firefly-b6uish7j.neonauth.c-2.sa-east-1.aws.neon.tech/neondb/auth`, alcance **Builds y Functions**, y republicar solo `experiment/netlify-free`. Comprobar también que el hostname de `DATABASE_URL` sea exactamente `ep-late-firefly-b6uish7j-pooler.c-2.sa-east-1.aws.neon.tech` (rama `br-restless-breeze-b69gsedg`), sin copiar la URL ni contraseña. Mantener los secretos fuera de Git y de `NEXT_PUBLIC_`.
3. **Confirmado:** la API pública de Netlify muestra `experiment/netlify-free` y el commit `d5b1193` como deploy publicado `ready`. En **Deploys**, revisar todavía build log, función OpenNext y errores. En **Usage/Billing**, anotar el plan y el consumo; no cambiar a un plan pago.
4. Facilitar una casilla QA bajo control del propietario para los Magic Links autorizados. Crear identidades QA únicamente en la rama Neon de ensayo; completar las pruebas HTTP autenticadas, de datos y latencia descritas arriba. No vincular membresías por un correo enviado desde el navegador.

**Veredicto: NO-GO para sustitución definitiva de Vercel.** La URL pública, el deploy de la rama correcta, las rutas Next.js y los rechazos sin sesión ya funcionan en Netlify. El inicio de sesión está conectado por error al Auth de Vercel Preview. Faltan corregir esa variable, confirmar la rama de la base, completar el flujo autenticado y financiero real, el aislamiento de datos, la comparación de velocidad y el consumo medido. Mantener Vercel como referencia hasta que esos gates pasen; este veredicto no autoriza migrar Production.
