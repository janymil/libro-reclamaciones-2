import { useState } from "react";

import { useAIFeedback } from "@/hooks/use-complaints";
import { Button } from "@/components/ui/button";

/**
 * Thumbs up/down for an AI result. The rating is stored per feature, which is
 * what makes an acceptance rate possible; it is optional and never blocks the
 * workflow.
 */
export default function AIFeedbackButtons({
  feature,
  complaintId,
  className = "",
}: {
  feature: string;
  complaintId?: string;
  className?: string;
}) {
  const feedback = useAIFeedback();
  const [sent, setSent] = useState<1 | -1 | null>(null);

  const submit = (rating: 1 | -1) => {
    feedback.mutate(
      { feature, rating, complaintId },
      { onSuccess: () => setSent(rating) },
    );
  };

  if (sent !== null) {
    return (
      <p className={`text-xs text-gray-500 ${className}`}>
        {sent === 1 ? "Gracias, nos ayuda a mejorar." : "Gracias. Revisaremos este resultado."}
      </p>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-xs text-gray-500">¿Útil?</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => submit(1)}
        disabled={feedback.isPending}
        aria-label="Resultado útil"
        data-testid={`ai-feedback-up-${feature}`}
      >
        <span className="material-icons text-base text-green-700">thumb_up</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => submit(-1)}
        disabled={feedback.isPending}
        aria-label="Resultado poco útil"
        data-testid={`ai-feedback-down-${feature}`}
      >
        <span className="material-icons text-base text-red-700">thumb_down</span>
      </Button>
    </div>
  );
}
