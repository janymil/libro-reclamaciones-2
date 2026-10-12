import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AIAssistant from "./ai-assistant";

interface AIAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Reusable modal wrapper around the AI assistant (classification + replies). */
export default function AIAssistantDialog({ open, onOpenChange }: AIAssistantDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asistente IA - ReclamoBot</DialogTitle>
          <DialogDescription>
            Clasificación automática y redacción asistida de respuestas conforme a la normativa peruana.
          </DialogDescription>
        </DialogHeader>
        <AIAssistant />
      </DialogContent>
    </Dialog>
  );
}
