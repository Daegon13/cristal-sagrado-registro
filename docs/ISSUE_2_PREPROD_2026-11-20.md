# Incidencia #2: preproducción de Registro (20/11/2026)

**Actualización posterior:** el propietario confirmó la recepción de ambos informes QA. La corrección del doble despacho y el GO/NO-GO vigente están en [incidencia #3](ISSUE_3_RELEASE_GATE_2026-11-20.md). La observación histórica de más abajo refleja lo que se sabía al cerrar #2.

## Decisión

**GO técnico para continuar en Preview; NO-GO para Production.** PR #1 sigue abierta y en borrador sobre `feat/neon-migration`; `main` no se fusionó. Ningún dato de QA se copió a Production. El cambio prioriza registrar consultas, ventas y cobros con pocos pasos. Esta aceptación no autoriza un envío de correo, un cambio de plan con costo, una migración productiva ni el despliegue público.

## Entrega funcional

- Inicio muestra consultas recientes y su estado. Cada fila permite **Convertir en venta**; la venta conserva `inquiry_id`, usa el cliente ya asociado o crea una ficha identificable solo al convertir una consulta anónima, y abre **Registrar cobro** con la venta seleccionada. **Cobrar después** queda disponible. Consultas y ventas múltiples conservan la misma ficha y su fuente declarada.
- El selector de clientes es un buscador de servidor con 10 resultados, recientes sin texto, coincidencia por alias/nombre/`@handle` sin distinguir mayúsculas ni acentos, estado «Sin venta», «Con venta» o «Ya cobró» y contexto. No carga 500 opciones nativas. El handle solo es único por organización cuando se confirma. Los posibles duplicados se muestran para revisión; la fusión manual exige dos IDs de la misma organización, actualiza vínculos en una transacción y deja auditoría.
- Campañas tienen fechas inclusivas, presupuesto diario o total; los gastos reales tienen período, monto, fuente Ads Manager y campaña opcional. Un rango que cruza el informe semanal queda **sin asignar** a esa semana y se informa la cobertura incompleta; no se inventa un reparto. No se muestra porcentaje cuando faltan importes comparables. El nuevo formulario de gastos ordinarios excluye publicidad, comprueba asientos publicitarios anteriores y rechaza solapes activos para la misma campaña y período. Un recibo no se suma nuevamente al gasto de Ads Manager.
- El informe muestra desde/hasta, el origen del valor predeterminado y una casilla de confirmación. El POST usa una copia de esas mismas fechas. Los informes separan gasto publicitario de otros; los asientos publicitarios anteriores se identifican por separado y el CSV de publicidad marca `included_in_totals`. La app solo muestra alertas de presupuesto: no cambia ni detiene campañas en Meta.
- Neon Auth sigue vigente. Magic Link es la acción principal, con callback al mismo origen, aviso de vencimiento y consejo para abrir el enlace en Chrome externo desde Gmail. La contraseña permanece como alternativa secundaria. La sesión QA persistió al recargar Chrome en Preview; el Honor de Lucía aún requiere aceptación manual con URL definitiva.

## SQL, ramas y respaldo

1. `sql/003_neon_initial.sql`: esquema base existente, solo para una rama nueva vacía de Neon.
2. `sql/004_daily_register.sql`: campos de identidad/duplicados, vínculo consulta→venta, idempotencia de venta, campañas, gastos por período, índices, restricciones de organización, solape y auditoría.

La migración `004` se aplicó **solo** a `preview/feat/neon-migration` (`br-shy-salad-b6nmhtc9`) del proyecto Neon `little-credit-80176183`. Antes se creó la rama de recuperación `backup/pre-004-preview-2026-11-19` (`br-flat-sea-b67vkwus`), en estado READY. No se obtuvo snapshot: la API devolvió `INVALID_ARGUMENT`; la rama de recuperación es la salvaguarda disponible. La rama Production `br-mute-cake-b6lh2rom` sigue sin tablas públicas de la aplicación. No se aplicaron `001` ni `002` de Supabase.

## Verificación

| Prueba | Resultado y límite |
| --- | --- |
| `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check` | PASS: 68 paquetes instalados, 0 vulnerabilidades; 12/12 tests; TypeScript y build correctos; diff sin errores. |
| Chrome 390 × 844, Preview, 100/300/500 contactos ficticios | Búsqueda por `@maria.ultima`, resultado de la última ficha y ausencia de desborde horizontal. Respuestas financieras simuladas en navegador; JavaScript y página servidos por Preview. |
| Chrome 390 × 844, Preview, flujo consulta→venta→cobro | Una venta y un cobro desde la misma consulta sin elegir cliente de nuevo; formulario de informe con un día y POST del mismo día. El endpoint de envío se simuló: **no se envió correo** en esta prueba. |
| Preview autenticado con Magic Link, organización QA | Sesión y membresía QA, persistencia tras recarga, consulta anónima, venta, cobro, campaña y gasto real de período cruzado, exportación JSON, anulación auditada. La primera ejecución de la automatización convirtió por error una consulta ficticia anterior; dejó una venta QA adicional. Las ejecuciones siguientes seleccionaron la consulta anónima correcta. |
| Autorización y finanzas en Preview | Lectura, exportación y escritura hacia otra organización: 403. Solape de gasto: 409. Exportación con campaña y gasto real de 200 UYU. Gasto anulado: 0 UYU activo. La organización real mantiene 0 contactos, consultas, ventas, cobros, campañas, gastos publicitarios y despachos. |

El Preview del commit `ee220d1` (`dpl_5R9ECTQSShAfGvziqFgok3jFCjB2`) quedó READY. Playwright ejecutó **5/5 E2E** en ese despliegue a 390 px el 20/11; la captura anterior se obtuvo por separado del Preview previo. El endpoint de informe estaba simulado y no se efectuó ningún envío real nuevo.

Las capturas [antes](screenshots/registro-390-antes.png), [inicio](screenshots/registro-390-inicio.png), [venta](screenshots/registro-390-venta.png), [informe](screenshots/registro-390-informe.png) y [publicidad](screenshots/registro-390-publicidad.png) usan **datos ficticios simulados**. La captura anterior procede del Preview del commit previo; las demás, del nuevo Preview. No muestran datos de Lucía ni prueban por sí mismas almacenamiento o entrega de correo.

### Discrepancia de despachos QA que debe conciliarse

El informe de aceptación del 19/11 registró **un** despacho QA `sent` y un mensaje recibido. La consulta de solo lectura actual a `report_dispatches` muestra **dos** filas QA `sent` para `2026-11-16` a `2026-11-19`: una a las `22:54:10Z` con hash `891e1d7433f1…` y otra a las `23:43:58Z` con hash `61088b4780cc…`; ambas tienen ID de proveedor. La segunda es anterior al código y las pruebas de esta incidencia. El cambio del hash indica contenido diferente; la clave de idempotencia por contenido no impide enviar dos versiones para el mismo período. No se atribuye ni se da por recibido el segundo correo sin conciliación con Resend/Gmail y su autorización. **No reenviar** para investigar. Esta diferencia bloquea la aceptación financiera de Production.

## Bloqueantes de Production

| Bloqueante | Acción verificable antes de GO |
| --- | --- |
| SMTP propio de Neon Auth | Configurar proveedor verificado para la rama Auth de Production; probar Magic Link, caducidad y recuperación en el Honor. Neon lo exige en su [lista de producción](https://neon.com/docs/auth/production-checklist). Preview y Production siguen con SMTP compartido. |
| Alojamiento comercial y enlace definitivo | El proyecto Vercel tiene protección SSO activa, que exige cuenta Vercel en su URL protegida; el enlace temporal de Preview no prueba acceso definitivo. El plan Hobby se limita a uso personal/no comercial según [términos de Vercel](https://vercel.com/legal/terms). Elegir alojamiento/plan permitido y dominio estable con aprobación del propietario; probar apertura desde el Honor sin cuenta Vercel. No se cambió ningún plan. |
| Auth y permisos productivos | Production tiene Magic Link desactivado, alta directa por contraseña permitida y localhost permitido. Cerrar alta directa, habilitar Magic Link y dominios de confianza; crear o verificar las cuentas reales y sus membresías en la organización correcta. Decidir el rol de Lucía con el propietario; no se degradó su acceso en Preview. |
| Esquema, respaldo y restauración | Respaldar Production antes de aplicar `003` y `004` a su rama vacía; comprobar variables de base/Auth de esa misma rama, claves y cron. Ensayar restauración y comparar conteos/totales en rama aislada. No copiar QA a Production. |
| Prueba financiera final | Conciliar los dos despachos QA y su autorización; luego probar con cifras ficticias el informe de período exacto, anexos, importes de cobros/devoluciones/gastos y ausencia de duplicados, sin enviar correo real salvo nueva autorización expresa. Verificar la nueva migración y la exportación/restauración. |
| Aceptación de Lucía | Probar búsqueda y flujo consulta→venta→cobro en su Honor a 390 px, Magic Link y sesión persistente desde el enlace definitivo. Su acceso previo desde Chrome externo en Preview no cubre este nuevo despliegue ni el enlace definitivo. |

La decisión posterior de fusionar PR #1 y desplegar Production requiere aprobación separada. Para repetir E2E, usar un enlace de acceso **temporal y privado** al Preview protegido en `PREVIEW_ACCESS_URL` y ejecutar `npx playwright test`; no guardar el token. La prueba autenticada `scripts/live-preview-qa.mjs` requiere una identidad QA ya autorizada y un Magic Link nuevo; genera datos ficticios, por lo que no debe ejecutarse sobre Production.
