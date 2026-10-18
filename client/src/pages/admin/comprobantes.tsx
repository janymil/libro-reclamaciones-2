import { useMemo, useState } from "react";

import AdminLayout from "@/components/layout/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useIsOperator } from "@/hooks/use-admin";
import {
  useAdminComprobantes,
  useBackfillComprobantes,
  useEmitComprobante,
  useSendComprobanteEmail,
  useVoidComprobante,
  type AdminComprobanteRow,
} from "@/hooks/use-comprobantes";
import { COMPROBANTE_DOC_TYPES, formatDataSheet } from "@shared/comprobantes";
import { PAYMENT_CURRENCY_SYMBOL } from "@shared/payments";
import { formatIgvRate } from "@shared/tax";

/**
 * Comprobantes: the manual-emission queue (Phase 1).
 *
 * The operator's job, in order:
 *   1. open a pending row;
 *   2. copy the data sheet into SUNAT's Facturador (or type the same fields);
 *   3. come back with the serie + correlativo SUNAT assigned and the PDF/XML;
 *   4. record them here, which mails the files to the buyer.
 *
 * The page never talks to SUNAT. What it guarantees instead is that no invoice
 * is recorded twice, that the correlativo matches the serie, and that the
 * customer's copy is the XML SUNAT actually accepted.
 */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;

const fecha = (value: string | null) =>
  value ? new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—";

const inputDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/** ISO timestamp -> the YYYY-MM-DD an <input type="date"> expects, in local time. */
const toInputDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? inputDate()
    : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const STATUS_TONE: Record<string, string> = {
  pendiente: "bg-amber-500/15 text-amber-300",
  emitido: "bg-emerald-500/15 text-emerald-300",
  anulado: "bg-slate-600/40 text-slate-300",
};

type Filter = "pendiente" | "emitido" | "anulado" | "todos";

export default function AdminComprobantesPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const query = useAdminComprobantes(isOperator);
  const emit = useEmitComprobante();
  const resend = useSendComprobanteEmail();
  const voidMutation = useVoidComprobante();
  const backfill = useBackfillComprobantes();

  const [filter, setFilter] = useState<Filter>("pendiente");
  const [search, setSearch] = useState("");

  const [target, setTarget] = useState<AdminComprobanteRow | null>(null);
  const [serie, setSerie] = useState("");
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(inputDate());
  const [notes, setNotes] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);

  const [voidTarget, setVoidTarget] = useState<AdminComprobanteRow | null>(null);
  const [voidNote, setVoidNote] = useState("");

  const items = query.data?.items ?? [];
  const counts = query.data?.counts ?? { pendiente: 0, emitido: 0, anulado: 0 };

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((row) => {
      if (filter !== "todos" && row.status !== filter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [
        row.fullNumber ?? "",
        row.businessName ?? "",
        row.ruc ?? "",
        row.customerName,
        row.customerDocNumber,
        row.paymentReference ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, filter, search]);

  const openEmit = (row: AdminComprobanteRow) => {
    const suggestion = query.data?.suggestions[row.docType];
    setTarget(row);
    if (row.status === "emitido" && row.serie && row.number) {
      // Updating files must keep the identity SUNAT already accepted.
      setSerie(row.serie);
      setNumber(row.number);
      setIssueDate(row.issueDate ? toInputDate(row.issueDate) : inputDate());
    } else {
      setSerie(suggestion?.serie ?? COMPROBANTE_DOC_TYPES[row.docType].defaultSerie);
      setNumber(suggestion?.number ?? "");
      setIssueDate(inputDate());
    }
    setNotes(row.notes ?? "");
    setSendEmail(true);
    setPdf(null);
    setXml(null);
  };

  const dataSheet = target
    ? formatDataSheet({
        docType: target.docType,
        serie,
        docNumber: target.customerDocNumber,
        name: target.customerName,
        address: target.customerAddress ?? "",
        email: target.customerEmail ?? "",
        description: target.description,
        issueDate,
        subtotalCents: target.subtotalCents,
        igvCents: target.igvCents,
        totalCents: target.totalCents,
        rateBps: target.igvRateBps,
        paymentReference: target.paymentReference ?? "",
        paymentMethodLabel: target.paymentMethod ?? "No indicado",
        notes: target.notes,
      })
    : "";

  const copyDataSheet = async () => {
    try {
      await navigator.clipboard.writeText(dataSheet);
      toast({ title: "Datos copiados", description: "Pégalos en el Facturador de SUNAT." });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "Selecciona el texto y cópialo manualmente.",
        variant: "destructive",
      });
    }
  };

  const submitEmit = async () => {
    if (!target) {
      return;
    }
    if (!/^\d{1,8}$/.test(number.trim())) {
      toast({
        title: "Correlativo inválido",
        description: "Escribe el número que dio SUNAT.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await emit.mutateAsync({
        id: target.id,
        serie,
        number,
        issueDate,
        notes,
        sendEmail,
        pdf,
        xml,
      });
      toast({ title: "Comprobante registrado", description: result.message });
      if (result.emailWarning) {
        toast({
          title: "El correo no se envió",
          description: result.emailWarning,
          variant: "destructive",
        });
      }
      setTarget(null);
    } catch (error) {
      toast({
        title: "No se pudo registrar",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Error",
        variant: "destructive",
      });
    }
  };

  const resendEmail = async (row: AdminComprobanteRow) => {
    try {
      const result = await resend.mutateAsync(row.id);
      toast({ title: "Correo enviado", description: result.message });
    } catch (error) {
      toast({
        title: "No se pudo enviar",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Error",
        variant: "destructive",
      });
    }
  };

  const submitVoid = async () => {
    if (!voidTarget) {
      return;
    }
    try {
      const result = await voidMutation.mutateAsync({ id: voidTarget.id, note: voidNote });
      toast({ title: "Comprobante anulado", description: result.message });
      setVoidTarget(null);
      setVoidNote("");
    } catch (error) {
      toast({
        title: "No se pudo anular",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Error",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout
      title="Comprobantes"
      subtitle={`${counts.pendiente} pendientes · ${counts.emitido} emitidos · ${counts.anulado} anulados`}
    >
      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Emisión manual en SUNAT</CardTitle>
            <CardDescription className="text-slate-400">
              Cada pago confirmado crea una fila pendiente con los datos del checkout. Emite el
              comprobante en el Facturador de SUNAT, vuelve con la serie, el correlativo y los
              archivos, y el cliente los recibe por correo. Los precios ya incluyen IGV (
              {formatIgvRate()}); el desglose de cada fila es el que debe llevar el comprobante.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {(["pendiente", "emitido", "anulado", "todos"] as Filter[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={filter === id ? "default" : "outline"}
                className={
                  filter === id
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                    : "border-slate-700 text-slate-200 hover:bg-slate-800"
                }
                onClick={() => setFilter(id)}
                data-testid={`filter-comprobantes-${id}`}
              >
                {id === "todos" ? "Todos" : id[0].toUpperCase() + id.slice(1)}
                {id !== "todos" ? ` (${counts[id]})` : ""}
              </Button>
            ))}
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por RUC, cliente, número o pago"
              className="ml-auto max-w-xs border-slate-700 bg-slate-950 text-slate-100"
              data-testid="search-comprobantes"
            />
            <Button
              size="sm"
              variant="outline"
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              disabled={backfill.isPending}
              onClick={async () => {
                try {
                  const result = await backfill.mutateAsync();
                  toast({
                    title: "Pendientes generados",
                    description: `${result.message} (${result.scanned} pagos revisados)`,
                  });
                } catch (error) {
                  toast({
                    title: "No se pudo generar",
                    description:
                      error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : "Error",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-backfill-comprobantes"
            >
              {backfill.isPending ? "Generando..." : "Generar pendientes antiguos"}
            </Button>
          </CardContent>
        </Card>

        {query.isLoading && <p className="text-sm text-slate-400">Cargando comprobantes...</p>}
        {query.isError && (
          <p className="text-sm text-rose-400">No se pudo cargar la cola de comprobantes.</p>
        )}

        {!query.isLoading && rows.length === 0 && (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="pt-6 text-sm text-slate-400">
              No hay comprobantes con ese filtro.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="border-slate-800 bg-slate-900">
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-100">
                        {row.paymentReference ?? row.id.slice(0, 8)}
                      </span>
                      <Badge className={STATUS_TONE[row.status] ?? "bg-slate-700 text-slate-200"}>
                        {row.status}
                      </Badge>
                      <span className="text-xs text-slate-400">{row.docTypeLabel}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-200">
                      {row.customerName}{" "}
                      <span className="font-mono text-slate-400">
                        · {row.customerDocType === "6" ? "RUC" : "DNI"}{" "}
                        {row.customerDocNumber || "—"}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.businessName ?? "—"} · {row.description}
                    </p>
                    <p className="text-xs text-slate-400">
                      Pago {fecha(row.createdAt)} · {row.paymentMethod ?? "medio no indicado"}
                      {row.customerEmail ? ` · ${row.customerEmail}` : " · SIN CORREO"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-semibold text-slate-100">
                      {money(row.totalCents)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Base {money(row.subtotalCents)} + IGV {formatIgvRate(row.igvRateBps)}{" "}
                      {money(row.igvCents)}
                    </p>
                    {row.fullNumber && (
                      <p className="font-mono text-xs text-emerald-300">{row.fullNumber}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.status !== "anulado" && (
                    <Button
                      size="sm"
                      className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                      onClick={() => openEmit(row)}
                      data-testid={`button-emit-comprobante-${row.id}`}
                    >
                      {row.status === "emitido" ? "Actualizar archivos" : "Registrar emisión"}
                    </Button>
                  )}

                  {row.status === "emitido" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        disabled={resend.isPending}
                        onClick={() => void resendEmail(row)}
                      >
                        Reenviar correo
                      </Button>
                      {row.pdfPath && (
                        <a
                          className="inline-flex items-center rounded-md border border-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-800"
                          href={`/api/comprobantes/${row.id}/file/pdf`}
                        >
                          PDF
                        </a>
                      )}
                      {row.xmlPath && (
                        <a
                          className="inline-flex items-center rounded-md border border-slate-700 px-3 text-xs text-slate-200 hover:bg-slate-800"
                          href={`/api/comprobantes/${row.id}/file/xml`}
                        >
                          XML
                        </a>
                      )}
                    </>
                  )}

                  {row.status !== "anulado" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-800 text-rose-300 hover:bg-rose-950"
                      onClick={() => {
                        setVoidTarget(row);
                        setVoidNote("");
                      }}
                    >
                      Anular
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? setTarget(null) : null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir {target?.docTypeLabel ?? "comprobante"}</DialogTitle>
            <DialogDescription>
              Copia los datos en el Facturador de SUNAT, emite el comprobante y vuelve con el
              número y los archivos. El correlativo no puede repetirse dentro de la serie.
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Datos para SUNAT</Label>
                  <Button size="sm" variant="outline" onClick={() => void copyDataSheet()}>
                    Copiar
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
                  {dataSheet}
                </pre>
                {!target.customerEmail && (
                  <p className="text-xs text-amber-700">
                    Este comprobante no tiene correo: se registrará, pero no se podrá enviar hasta
                    que el cliente actualice sus datos de facturación.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="emit-serie">Serie</Label>
                    <Input
                      id="emit-serie"
                      value={serie}
                      maxLength={4}
                      disabled={target.status === "emitido"}
                      onChange={(event) => setSerie(event.target.value.toUpperCase())}
                      placeholder={COMPROBANTE_DOC_TYPES[target.docType].defaultSerie}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emit-number">Correlativo</Label>
                    <Input
                      id="emit-number"
                      value={number}
                      inputMode="numeric"
                      maxLength={8}
                      disabled={target.status === "emitido"}
                      onChange={(event) => setNumber(event.target.value.replace(/\D/g, ""))}
                      placeholder="00000001"
                    />
                  </div>
                </div>

                {target.status === "emitido" && (
                  <p className="text-xs text-amber-700">
                    La serie y el correlativo ya fueron emitidos: solo puede actualizar los
                    archivos y las notas. Para corregirlos, emita una nota de crédito.
                  </p>
                )}

                <div>
                  <Label htmlFor="emit-date">Fecha de emisión</Label>
                  <Input
                    id="emit-date"
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="emit-pdf">PDF (representación impresa)</Label>
                  <Input
                    id="emit-pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => setPdf(event.target.files?.[0] ?? null)}
                  />
                </div>

                <div>
                  <Label htmlFor="emit-xml">XML (documento válido ante SUNAT)</Label>
                  <Input
                    id="emit-xml"
                    type="file"
                    accept="application/xml,text/xml,.xml"
                    onChange={(event) => setXml(event.target.files?.[0] ?? null)}
                  />
                </div>

                <div>
                  <Label htmlFor="emit-notes">Nota interna (opcional)</Label>
                  <Textarea
                    id="emit-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Número de ticket de SUNAT, observaciones..."
                    rows={2}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(event) => setSendEmail(event.target.checked)}
                  />
                  Enviar el PDF y el XML al cliente al registrar
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={emit.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => void submitEmit()} disabled={emit.isPending}>
              {emit.isPending ? "Registrando..." : "Registrar emisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => (!open ? setVoidTarget(null) : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular comprobante</DialogTitle>
            <DialogDescription>
              {voidTarget?.status === "emitido"
                ? "Emite la nota de crédito en SUNAT y registra aquí el motivo. El cliente dejará de ver este comprobante como vigente."
                : "Todavía no se emitió en SUNAT: se descartará de la cola y no se enviará."}
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="void-note">Motivo</Label>
            <Textarea
              id="void-note"
              value={voidNote}
              onChange={(event) => setVoidNote(event.target.value)}
              placeholder="Devolución, error en los datos, pago revertido..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVoidTarget(null)}
              disabled={voidMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitVoid()}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? "Anulando..." : "Marcar como anulado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
