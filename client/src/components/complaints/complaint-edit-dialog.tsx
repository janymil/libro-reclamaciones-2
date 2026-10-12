import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateComplaint } from "@/hooks/use-complaints";
import { COMPLAINT_STATUSES, COMPLAINT_PRIORITIES } from "@/lib/constants";
import type { Complaint } from "@shared/schema";

interface ComplaintEditDialogProps {
  complaint: Complaint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Lets the business update the follow-up state of a complaint. */
export default function ComplaintEditDialog({ complaint, open, onOpenChange }: ComplaintEditDialogProps) {
  const { toast } = useToast();
  const updateComplaint = useUpdateComplaint();

  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");

  useEffect(() => {
    if (open && complaint) {
      setStatus(complaint.status);
      setPriority(complaint.priority);
    }
  }, [open, complaint]);

  if (!complaint) {
    return null;
  }

  const handleSave = async () => {
    try {
      await updateComplaint.mutateAsync({
        id: complaint.id,
        data: { status, priority },
      });
      toast({
        title: "Reclamación actualizada",
        description: `Estado: ${COMPLAINT_STATUSES[status as keyof typeof COMPLAINT_STATUSES]}, prioridad: ${COMPLAINT_PRIORITIES[priority as keyof typeof COMPLAINT_PRIORITIES]}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "No se pudo actualizar",
        description: "Intente nuevamente en unos instantes.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar reclamación {complaint.correlativeNumber}</DialogTitle>
          <DialogDescription>
            Actualice el estado de seguimiento y la prioridad de atención.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1" data-testid="select-edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COMPLAINT_STATUSES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Prioridad</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1" data-testid="select-edit-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COMPLAINT_PRIORITIES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="btn-primary"
            onClick={handleSave}
            disabled={updateComplaint.isPending}
            data-testid="button-edit-save"
          >
            {updateComplaint.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
