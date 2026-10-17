import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import { apiRequest } from "@/lib/queryClient";
import { invalidateTenantQueries } from "@/lib/tenant-queries";
import type { Business } from "@shared/schema";

/**
 * "¿Cuántos locales atenderás en total?" - what the company declared when it
 * registered, editable here.
 *
 * It is the number the "Primeros pasos" checklist on /panel uses to say
 * "Sucursales 2 de 5" and to remind which locales are still missing. A company
 * that opens another local (or closes one) would otherwise keep a target that
 * never matches reality, and the reminder would either nag forever or disappear
 * for the wrong reason.
 *
 * Guidance only: quotas, billing and the legal records count the establishments
 * that actually exist. Empty means "not declared", which is the normal case for a
 * business with a single local.
 */
export default function ExpectedLocales() {
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();

  const { data: business } = useQuery<Business | null>({ queryKey: ["/api/businesses/current"] });

  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);

  // Follow the stored value until the customer types something.
  useEffect(() => {
    if (dirty) return;
    setValue(business?.expectedEstablishments ? String(business.expectedEstablishments) : "");
  }, [business?.expectedEstablishments, dirty]);

  const save = useMutation({
    mutationFn: async (expectedEstablishments: number | null) => {
      const response = await apiRequest("PATCH", `/api/businesses/${business!.id}`, {
        expectedEstablishments,
      });
      return response.json();
    },
    onSuccess: () => {
      // The checklist on /panel reads this same record.
      invalidateTenantQueries(queryClient);
      setDirty(false);
      toast({
        title: "Locales actualizados",
        description: "El recordatorio de locales pendientes ya usa este número.",
      });
    },
    onError: (error) => upgradeToast(error, "No se pudo guardar el número de locales"),
  });

  if (!business) return null;

  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const clearing = trimmed === "";
  const valid = clearing || (Number.isFinite(parsed) && parsed >= 1 && parsed <= 500);
  const unchanged = clearing
    ? business.expectedEstablishments == null
    : parsed === business.expectedEstablishments;

  const submit = () => {
    if (!valid || save.isPending) return;
    save.mutate(clearing ? null : Math.round(parsed));
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-end"
      data-testid="expected-locales"
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor="expected-locales-input">¿Cuántos locales atenderás en total?</Label>
        <Input
          id="expected-locales-input"
          type="number"
          min={1}
          max={500}
          value={value}
          placeholder="Ej.: 5"
          data-testid="input-expected-locales"
          onChange={(event) => {
            setDirty(true);
            setValue(event.target.value);
          }}
        />
        <p className="text-xs text-gray-500">
          Cuenta la casa matriz. Lo usamos para recordarte en el panel los locales que faltan
          registrar; déjalo vacío si aún no lo sabes.
        </p>
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={!valid || unchanged || save.isPending}
        data-testid="button-save-expected-locales"
      >
        {save.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Guardar
      </Button>
    </div>
  );
}
