import { useCallback } from 'react';
import { useLocation } from 'wouter';

import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { UPGRADE_PATH, isPlanError, parsePlanError, planErrorMessage } from '@/lib/plan-errors';

/**
 * The single way to report a plan or quota rejection.
 *
 * A blocked action must never look like a random failure: this shows the
 * server's own sentence ("Su plan Básico permite hasta 2 usuarios…") and adds a
 * "Ver planes" button that lands the customer on "Plan y Cuotas".
 */
export function useUpgradeToast() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  return useCallback(
    (error: unknown, fallbackTitle = 'No se pudo completar la acción') => {
      const upgrade = isPlanError(error);
      const info = parsePlanError(error);

      toast({
        title: upgrade ? 'Mejore su plan' : fallbackTitle,
        description: upgrade
          ? planErrorMessage(error)
          : info.message || 'Intente nuevamente en unos instantes.',
        variant: upgrade ? 'default' : 'destructive',
        action: upgrade ? (
          <ToastAction altText="Ver planes" onClick={() => setLocation(UPGRADE_PATH)}>
            Ver planes
          </ToastAction>
        ) : undefined,
      });
    },
    [toast, setLocation],
  );
}
