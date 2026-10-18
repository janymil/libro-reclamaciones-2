import { useMemo, useState } from "react";
import type { Complaint } from "@shared/schema";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COMPLAINT_SEARCH_LIMIT,
  complaintOptionLabel,
  filterComplaints,
} from "@/lib/ai-classification";
import { COMPLAINT_STATUSES, COMPLAINT_TYPES } from "@/lib/constants";

interface ComplaintPickerProps {
  id: string;
  label: string;
  /** Base for data-testid: `<prefix>-select`, `-search`, `-hint`, `-selected`. */
  testIdPrefix: string;
  complaints: Complaint[];
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
}

const MANUAL = "manual";

/**
 * Searchable "pick a stored complaint instead of pasting it" control, shared by
 * the classification and the response tools.
 *
 * A plain select stopped being usable at a few hundred rows, so this is a
 * combobox: type a correlative number, a consumer name (accents ignored), the
 * type or the product/service. Only the first `COMPLAINT_SEARCH_LIMIT` matches
 * are rendered, and the footer says so.
 */
export default function ComplaintPicker({
  id,
  label,
  testIdPrefix,
  complaints,
  isLoading,
  value,
  onChange,
}: ComplaintPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedComplaint =
    value === MANUAL ? null : complaints.find((complaint) => complaint.id === value) ?? null;

  const { matches, totalMatches, truncated } = useMemo(
    () => filterComplaints(complaints, query),
    [complaints, query],
  );

  const pick = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {label}
      </label>

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="w-full justify-between font-normal"
            data-testid={`${testIdPrefix}-select`}
          >
            <span className="truncate text-left">
              {value === MANUAL
                ? "Escribir o pegar el texto"
                : selectedComplaint
                  ? complaintOptionLabel(selectedComplaint)
                  : "Elige un reclamo registrado"}
            </span>
            <span className="material-icons text-base opacity-60" aria-hidden="true">
              unfold_more
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar por N°, consumidor, tipo o producto…"
              data-testid={`${testIdPrefix}-search`}
            />
            <CommandList>
              <CommandEmpty>No se encontraron reclamos.</CommandEmpty>
              <CommandGroup>
                <CommandItem value={MANUAL} onSelect={() => pick(MANUAL)}>
                  <span className="material-icons mr-2 text-base" aria-hidden="true">
                    edit_note
                  </span>
                  Escribir o pegar el texto
                </CommandItem>
                {matches.map((complaint) => (
                  <CommandItem
                    key={complaint.id}
                    value={complaint.id}
                    onSelect={() => pick(complaint.id)}
                    className="gap-2"
                    data-testid={`${testIdPrefix}-option-${complaint.correlativeNumber}`}
                  >
                    <span className="truncate">{complaintOptionLabel(complaint)}</span>
                    {complaint.id === value && (
                      <span className="material-icons ml-auto text-base text-primary" aria-hidden="true">
                        check
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {truncated && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Mostrando {COMPLAINT_SEARCH_LIMIT} de {totalMatches} reclamos. Escribe para filtrar.
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <p className="mt-1 text-xs text-gray-500" data-testid={`${testIdPrefix}-hint`}>
        {isLoading
          ? "Cargando tus reclamos…"
          : complaints.length === 0
            ? "Aún no tienes reclamos registrados: escribe o pega el texto manualmente."
            : "Busca por N°, consumidor, tipo o producto; el texto se completa solo."}
      </p>

      {selectedComplaint && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600"
          data-testid={`${testIdPrefix}-selected`}
        >
          <Badge
            className={
              selectedComplaint.complaintType === "reclamo"
                ? "bg-red-100 text-red-800"
                : "bg-blue-100 text-blue-800"
            }
          >
            {COMPLAINT_TYPES[selectedComplaint.complaintType as keyof typeof COMPLAINT_TYPES]}
          </Badge>
          <span className="font-medium text-gray-800">#{selectedComplaint.correlativeNumber}</span>
          <span>{new Date(selectedComplaint.submissionDate).toLocaleDateString("es-PE")}</span>
          <span>
            ·{" "}
            {COMPLAINT_STATUSES[selectedComplaint.status as keyof typeof COMPLAINT_STATUSES] ??
              selectedComplaint.status}
          </span>
        </div>
      )}
    </div>
  );
}
