# Especificación funcional y evolución

## Objetivo
Reducir trabajo administrativo de Lucía a **dos operaciones esenciales**: registrar contacto/consulta y registrar cobro. El sistema permite a Diego contrastar ingresos efectivamente percibidos contra inversión publicitaria y demás gastos.

## Definiciones
- **Consulta:** episodio de contacto registrado, atribuido al canal declarado. Cuenta eventos, no personas.
- **Cliente único:** contacto con ID persistente; evitar IDs diferentes para la misma persona.
- **Venta:** encargo de trabajo confirmado con importe acordado; no equivale a dinero cobrado.
- **Cobro:** movimiento recibido, con fecha y método; vinculado a venta.
- **Devolución:** movimiento que reduce caja, vinculado a la misma venta.
- **Gasto publicitario:** inversión efectivamente consumida en anuncios en su fecha de prestación, distinta de fecha de facturación de Meta.
- **CAC de publicidad:** gasto Meta / nuevos clientes **atribuibles** a anuncios, si existe atribución fiable; no usar todos los pagos como denominador automáticamente.

## Interfaz v1
- Inicio: cantidad cobrada en semana seleccionada, clientes pagos, consultas; cuatro botones grandes.
- Consulta: canal, cliente existente o alias nuevo opcional.
- Venta: cliente, servicio, precio acordado.
- Cobro: venta, cobro/devolución, importe, medio.
- Gasto: categoría, fecha, importe, nota.
- Finanzas: cobros, gastos, diferencia parcial, resumen a correo, respaldo JSON.
- Datos se guardan en PostgreSQL, no en el buzón.

## Diseño de informes
Asunto `[CS-FINANZAS] AAAA-MM-DD a AAAA-MM-DD · digest`.
Cuerpo: cifras agregadas y bloque JSON parseable con `schema=cristal-sagrado-finanzas/v1`.
Adjuntos: `cs-informe.json`, `cs-cobros.csv`, `cs-gastos.csv`, **sin nombres de clientes**. El campo client_source se deriva del contacto original y no garantiza atribución de anuncio.

## Evolución posterior
1. Formularios RPC transaccionales; prevenir doble toque con claves idempotentes persistidas.
2. Mejorar búsqueda/deduplicación y corrección administrativa con historial visible.
3. Importador de gastos Meta desde CSV de Ads Manager; tolerancia a cambios en facturación.
4. Conciliación de Itaú/Prex por CSV, sin pedir contraseñas bancarias.
5. Comparación semanal con Umami, respetando que `wa_outbound` no es pago ni mensaje enviado.
6. Cierre semanal automático en Vercel Cron o GitHub Actions una vez validados accesos/uso.
7. Panel de atribución por campañas y origen: orgánico, pago, referidos y web, con campos desconocidos cuando no hay evidencia.
8. Reportes de rentabilidad por servicio, considerando tiempo, comisiones, insumos, impuestos y devoluciones.
