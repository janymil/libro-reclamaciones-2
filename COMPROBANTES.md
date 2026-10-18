# Comprobantes electrónicos — Fase 1 (emisión manual)

> Estado: implementado. La emisión se hace **a mano en SUNAT**; la plataforma
> prepara los datos, controla los correlativos y entrega el PDF/XML al cliente.
> Fase 2 (PSE con API y CDR automático) reutiliza las mismas filas.

## 1. Decisión comercial que manda sobre todo lo demás

Los precios publicados son **precios finales con IGV incluido**. El importe que
se cobra es el precio de la lista; el IGV se **descompone** de él, nunca se suma
encima:

```
total     = precio publicado
base      = round(total / 1.18, 2)
IGV       = total - base        ← el resto, para que base + IGV = total exacto
```

Ejemplo: S/ 189.00 → base S/ 160.17 + IGV S/ 28.83 = S/ 189.00.

Esto está en `shared/tax.ts` (`igvBreakdown`, `IGV_RATE_BPS = 1800`,
`PRICES_INCLUDE_IGV_NOTE`) y es la única aritmética que usan el checkout, el
comprobante y los correos. Cambiar la tasa (por ejemplo al 8% de restaurantes)
es cambiar el `rateBps`; el precio de venta no se toca.

## 2. Qué hace la app

1. **Checkout** (`client/src/components/payments/checkout-dialog.tsx`)
   - Muestra el desglose valor de venta + IGV + total.
   - Pide **factura o boleta antes de pagar**.
   - Factura: RUC (checksum módulo 11), razón social y domicilio fiscal.
   - Boleta: DNI opcional; vacío = consumidor final.
   - Correo de facturación obligatorio en ambos casos.
   - El servidor revalida todo (`validateBilling`) y guarda la preferencia en
     `businesses` para la próxima compra.
2. **Pago confirmado** → `settlePayment` crea **una** fila `pendiente` en
   `comprobantes` (`ensureComprobanteForPayment`, idempotente por `payment_id`).
   Se dispara con webhook de la pasarela, pago manual confirmado y renovaciones.
   La fila guarda el **snapshot** del comprador, los montos y la tasa: un cambio
   posterior del perfil no reescribe un comprobante ya emitido.
3. **Consola → Comprobantes** (sección `/comprobantes` de la consola; la ruta
   base depende de `VITE_ADMIN_PATH`, por defecto `/acceso/operaciones-7f31`)
   - Cola por estado, búsqueda por RUC/nombre/número/referencia.
   - "Registrar emisión": muestra la **ficha para SUNAT** con botón Copiar,
     pide serie + correlativo + fecha, y adjunta PDF y XML.
   - Valida serie (4 alfanuméricos), correlativo numérico y **duplicados por
     serie** antes de guardar.
   - Al registrar, envía PDF + XML al correo del cliente.
   - Permite reenviar el correo y anular (nota de crédito).
4. **Cliente → Pagos** (`/pagos`)
   - Cada pago muestra su comprobante: pendiente / número + enlaces PDF y XML.
   - Tarjeta "Datos de facturación" para corregir RUC/DNI/correo de las próximas
     compras.
5. **Público** (`/comprobantes`): explica IGV incluido, factura vs boleta,
   plazos, XML vs PDF y verificación en SUNAT. Enlazado desde la portada, los
   términos y el pie.

## 3. Datos y migración

Migración: `migrations/0015_comprobantes.sql` (idempotente, con entrada en
`migrations/meta/_journal.json`).

- `businesses`: `billing_doc_type`, `billing_email`, `billing_dni`.
- `payments` / `subscriptions`: snapshot `billing_doc_type`,
  `billing_doc_number`, `billing_name`, `billing_address`, `billing_email`.
  Las renovaciones heredan el snapshot de la suscripción.
- `comprobantes`: una fila por pago (`uq_comprobantes_payment`), serie +
  correlativo únicos (`uq_comprobantes_serie_number`), estado
  `pendiente|emitido|anulado`, montos en céntimos, rutas del PDF/XML y fechas
  de emisión/envío.

Aplicar:

```bash
npm run db:apply migrations/0015_comprobantes.sql
```

Los archivos se guardan en `COMPROBANTES_DIR` (por defecto
`$ATTACHMENTS_DIR/comprobantes`, es decir `uploads/comprobantes`) con nombres
aleatorios y subcarpetas `YYYY/MM`. El PDF/XML se descarga solo con sesión y
solo para el dueño del comprobante o un operador.

### 3.1 Verificación del RUC en SUNAT

Una factura no se emite sin comprobar que el RUC existe y que la razón social
es la que SUNAT tiene registrada. Se reutiliza el proxy de consulta RUC que ya
usa el registro (`server/ruc-lookup.ts`), con su caché de 24 h:

- `GET /api/billing/ruc/:ruc` (autenticado) devuelve razón social, estado,
  condición y domicilio sugerido. Si el proveedor está caído responde
  `available: false`, nunca “RUC inválido”.
- El checkout repite la consulta **en el servidor** antes de crear el pago:
  - RUC inexistente → se rechaza;
  - `BAJA` o `NO HABIDO` → se rechaza con el estado de SUNAT;
  - razón social de otra empresa → se rechaza y se sugiere la de SUNAT;
  - proveedor caído → **se permite pagar** (no se convierte una caída de un
    tercero en una venta perdida) y se registra el aviso en el log.
- La comparación de nombres (`shared/ruc.ts`) ignora tildes, puntuación y la
  forma societaria (`S.A.C.` = `SOCIEDAD ANONIMA CERRADA`), acepta la forma
  corta reconocible y rechaza fragmentos genéricos de una sola palabra.

### 3.2 Dos reglas que el flujo ya cumple

- **La página de “pago exitoso” no emite nada.** El retorno del checkout solo
  llama a `refreshPayment`, que vuelve a preguntar al proveedor por el estado
  real (`findPaymentByReference` / `fetchStatus`) antes de asentar el pago. El
  comprobante se crea únicamente cuando el pago queda `paid`.
- **No hay doble emisión.** `comprobantes.payment_id` es único, la creación
  (`ensureComprobanteForPayment`) empieza leyendo si ya existe y tolera la
  carrera con el índice único; `settlePayment` no vuelve a procesar un pago ya
  pagado. La emisión manual, además, rechaza un correlativo repetido dentro de
  la serie (comprobación en la app + índice único en la base).

## 4. Rutina de emisión (Fase 1)

1. Entrar a **Consola → Comprobantes** y filtrar `pendiente`.
2. Abrir la fila y **Copiar** la ficha.
3. Emitir en SUNAT (Facturador / Emisor electrónico) con esos datos.
4. Volver a la fila, escribir la **serie** y el **correlativo** que asignó
   SUNAT, adjuntar el **PDF** y el **XML**, y registrar.
5. Verificar que el correo salió (`emailSentAt`). Si el cliente no lo recibió,
   "Reenviar correo".
6. Si hubo devolución o error: emitir la **nota de crédito** en SUNAT y marcar
   la fila como **anulada** con el motivo.

Plazo prometido al cliente: **3 días hábiles** desde el pago.

## 5. Reglas que la app hace cumplir

- No se emite factura sin RUC válido (checksum, no solo 11 dígitos).
- No se puede cambiar el tipo de comprobante ni el RUC después de pagar.
- Un correlativo no se repite dentro de la misma serie y tipo.
- El total del comprobante es exactamente lo cobrado; la base y el IGV suman
  ese total al céntimo.
- Un comprobante anulado no vuelve a emitirse: se emite uno nuevo.
- El cliente solo ve sus propios comprobantes (salvo operadores).

## 6. Checklist antes de la primera emisión real

- [ ] RUC del emisor habido y habilitado como **emisor electrónico** en SUNAT.
- [ ] Serie definida (F001 facturas, B001 boletas) y **correlativo inicial**
      confirmado; no reutilizar números de otro sistema.
- [ ] Facturador/Emisor electrónico de SUNAT probado en ambiente beta.
- [ ] `COMPROBANTES_DIR` con respaldo (los XML + CDR son el documento legal).
- [ ] Correo transaccional funcionando (`npm run email:diagnose`).
- [ ] Migración 0015 aplicada y `npm run check` en verde.
- [ ] Avisar al contador: las ventas se emiten manualmente; los pagos y su
      desglose están en `comprobantes`.

## 7. Fase 2 (cuando el volumen lo justifique)

Contratar un **PSE autorizado por SUNAT** (no un simple generador de PDF) y:

- emitir el XML en el webhook de pago y guardar el **CDR** en la misma fila;
- notas de crédito automáticas en devoluciones;
- resumen diario de boletas y contingencia a cargo del PSE;
- mantener la consola como visor/fallback, no como paso obligatorio.

Preguntas mínimas al proveedor: número de autorización como PSE, si devuelve el
CDR por API, si firma con su certificado o el nuestro, cómo maneja series,
resumen diario, contingencia y notas de crédito, y precio por documento.

## 8. Pruebas

- `shared/tax.test.ts`: el desglose suma exacto al céntimo, 18% y 8%.
- `shared/comprobantes.test.ts`: checksum de RUC, validación, numeración y
  ficha para SUNAT.
- `shared/ruc.test.ts`: normalización de razón social, formas societarias,
  `NO HABIDO` y falsos positivos.
- `server/services/comprobanteService.test.ts`: snapshot, idempotencia por
  `payment_id`, correlativo duplicado y anulación.
- `server/ruc-lookup.test.ts`: contrato del proxy RUC (sin cambios de
  comportamiento tras extraer `lookupRucRecord`).
- `server/services/paymentReceipt.test.ts`: el recibo sigue saliendo al
  confirmarse el pago (ahora con desglose de IGV y comprobante).

