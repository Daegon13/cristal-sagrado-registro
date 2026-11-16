# Checklist previo a producción

## Identidad y seguridad
- [ ] Probar login de Lucía; logout; login de Diego.
- [ ] Usuario externo no puede registrarse, iniciar sesión ni leer datos.
- [ ] RLS: desde otra organización, intentar leer/escribir `contacts`, `sales`, `payments`, `expenses`, `inquiries` y confirmar denegación.
- [ ] Confirmar que la service-role key solo está en variables de servidor de Vercel.
- [ ] Verificar que correo de informe no incluye alias, emails, teléfonos ni datos privados.
- [ ] Comprobar borrado / retención de datos y exportación completa para privacidad.

## Flujos
- [ ] Registrar consulta IG como cliente nuevo; aparece una sola vez.
- [ ] Registrar segunda consulta de cliente existente; consultas=2, clientes=1.
- [ ] Registrar venta acordada $U 3000, luego seña $U 1000 y saldo $U 2000; neto cobrado $U 3000.
- [ ] Registrar devolución $U 500; neto cobrado $U 2500.
- [ ] Registrar gasto de publicidad por período real. No duplicar el gasto usando el email de cargo de tarjeta.
- [ ] Probar conexión móvil lenta/reintentos y evitar registros duplicados.
- [ ] RPC: simular fallo o corte entre contacto y consulta, confirmar que la transacción hace rollback completo.
- [ ] Dos llamadas simultáneas a `register_inquiry` con la misma clave: una consulta y un cliente como máximo.
- [ ] Reintento de cobro/gasto con la misma idempotency_key: una sola fila.
- [ ] Anular asiento erróneo con motivo; constatar `voided_at`, `voided_by`, `void_reason` y eventos `audit_log`.
- [ ] Intentar modificar monto o medio de un cobro existente por API: debe ser rechazado; solo se permite anulación.

## Email
- [ ] Remitente verificado en Resend, destinatario aprobado, correo recibido sin spam.
- [ ] JSON se analiza automáticamente, adjuntos CSV válidos y sin información identificable.
- [ ] Repetir envío sin cambios y verificar deduplicación.
- [ ] Cambiar un registro y enviar revisión; ambos mensajes distinguidos por hash.
- [ ] Comparar semana (lunes a domingo) desde medianoche Montevideo: no cortar eventos.
- [ ] Añadir filtro en Gmail para `[CS-FINANZAS]`; no enviarlo a Papelera.

## Calidad
- [x] `npm test`: seis pruebas unitarias de fecha y cálculo financiero, aprobadas en el entorno de preparación.
- [x] Transpilación TypeScript de sintaxis en archivos principales sin errores.
- [ ] Confirmar que `sql/002_hardening.sql` se aplica en Supabase sin errores.
- [ ] Confirmar que en Vercel las variables `CRON_SECRET` y `REPORT_ORG_ID` están configuradas; no probar cron hasta tener usuarios y base funcional.
- [ ] `npm run typecheck`, `npm run build`.
- [ ] Prueba real Android Honor: pantalla de inicio, tamaño de botones, teclado numérico, formularios con una mano.
- [ ] Hacer respaldo y **prueba de restauración** antes de producción.
- [x] Iconos PWA incluidos en el proyecto.
- [ ] Confirmar instalación y comportamiento sin conexión en Android (mostrar error claro).
- [ ] Revisar límites de Supabase y Resend, volumen esperado, dominio y logs.

## Operación recomendada
- Lu registra consultas y cobros, Diego reconcilia los pagos con Itaú/Prex.
- Diego carga gastos de Meta por fecha de prestación y etiqueta anuncio/campaña cuando esté disponible.
- Cierre semanal tras finalizar domingo en America/Montevideo.
- En Gmail analizar inversión, consultas orgánicas, clientes pagos, CAC real y márgenes; no confundir leads con pagos.
