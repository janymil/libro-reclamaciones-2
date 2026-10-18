import { Link } from "wouter";

import { LegalPage, LegalList, LegalSection } from "@/components/legal/legal-page";
import { COMPROBANTE_ISSUE_DAYS, COMPROBANTE_LEGAL_NOTE, COMPROBANTE_VERIFICATION_NOTE } from "@shared/comprobantes";
import { IGV_RATE_BPS, formatIgvRate, igvBreakdown } from "@shared/tax";
import { OPERATOR } from "@/lib/platform-legal";

/**
 * Public explanation of how invoicing works.
 *
 * This is the page the "emitimos boleta o factura electrónica" line points to:
 * a customer (or their accountant) can read, before paying, what document they
 * will get, which data is needed, when it arrives and how to verify it.
 */

const EXAMPLE = igvBreakdown(18900, IGV_RATE_BPS);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

export default function ComprobantesPage() {
  return (
    <LegalPage
      eyebrow="Facturación"
      title="Boletas y facturas electrónicas"
      lead="Todos nuestros precios incluyen IGV. Por cada pago emitimos un comprobante de pago electrónico válido ante SUNAT, a nombre de la persona o empresa que usted indique antes de pagar."
      testId="page-comprobantes"
      showLastUpdated={false}
    >
      <LegalSection title="1. Precios con IGV incluido">
        <p>
          Los precios publicados son el precio final que usted paga. El IGV (
          {formatIgvRate()} = 16% IGV + 2% Impuesto de Promoción Municipal) ya está incluido y no
          se agrega en el checkout.
        </p>
        <p>
          Así se descompone, por ejemplo, el plan Pro anual de {soles(EXAMPLE.totalCents)}:
        </p>
        <LegalList
          items={[
            `Valor de venta (sin IGV): ${soles(EXAMPLE.subtotalCents)}`,
            `IGV (${formatIgvRate()}): ${soles(EXAMPLE.igvCents)}`,
            `Total que paga: ${soles(EXAMPLE.totalCents)}`,
          ]}
        />
        <p>
          El comprobante lleva exactamente ese desglose. Elegir factura o boleta no cambia el total:
          solo cambia a nombre de quién se emite.
        </p>
      </LegalSection>

      <LegalSection title="2. Boleta o factura: usted elige antes de pagar">
        <LegalList
          items={[
            'Factura electrónica: se emite a una empresa, con su RUC, razón social y domicilio fiscal. Es el documento que permite sustentar el gasto y usar el crédito fiscal.',
            'Boleta de venta electrónica: se emite a una persona natural. El DNI es opcional; si no lo indica, se emite a consumidor final.',
            'No emitimos factura sin RUC: una factura a consumidor final no existe en el régimen peruano.',
            'La elección se hace en el checkout, antes del pago. Un comprobante ya emitido no puede cambiarse a otro RUC: para corregirlo se emite una nota de crédito y un nuevo comprobante.',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Cuándo y cómo la recibe">
        <p>
          El comprobante se envía al correo que usted indique en el checkout dentro de los{' '}
          {COMPROBANTE_ISSUE_DAYS} días hábiles siguientes al pago confirmado. Recibirá dos archivos:
        </p>
        <LegalList
          items={[
            'El XML, que es el comprobante válido ante SUNAT y el que su contador necesita para registrarlo.',
            'El PDF, que es la representación impresa del mismo comprobante, con su código QR y el desglose de IGV.',
            'También puede descargarlos cuando quiera desde la sección Pagos de su panel.',
          ]}
        />
        <p>{COMPROBANTE_LEGAL_NOTE}</p>
      </LegalSection>

      <LegalSection title="4. Verificación en SUNAT">
        <p>{COMPROBANTE_VERIFICATION_NOTE}</p>
        <p>
          El emisor es {OPERATOR.businessName} (RUC {OPERATOR.ruc}). Si el comprobante no aparece o
          los datos no coinciden, escríbanos antes de usarlo en su contabilidad.
        </p>
      </LegalSection>

      <LegalSection title="5. Correcciones, devoluciones y notas de crédito">
        <LegalList
          items={[
            'Si los datos del comprobante están mal, emitimos la nota de crédito correspondiente y el comprobante correcto.',
            'Si se devuelve un pago, el comprobante se anula mediante nota de crédito; no se borra ni se reutiliza su número.',
            'El correlativo de cada serie es único y consecutivo: no se puede reasignar a otra operación.',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Datos de facturación">
        <p>
          Puede revisar y actualizar su RUC, razón social, domicilio y correo de facturación en{' '}
          <Link href="/pagos" className="underline underline-offset-2 text-[#c02b0a]">
            Pagos → Datos de facturación
          </Link>
          . Los cambios se aplican a las compras siguientes: el comprobante de un pago ya realizado
          conserva los datos con los que se emitió.
        </p>
        <p>
          ¿Necesita algo distinto? Escríbanos a{' '}
          <a
            href={`mailto:${OPERATOR.email}`}
            className="underline underline-offset-2 text-[#c02b0a]"
          >
            {OPERATOR.email}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
