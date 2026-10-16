import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Lock } from 'lucide-react';

import { PLAN_LIST, type PlanDefinition, type PlanFeatures } from '@shared/plans';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlans, useSubscription } from '@/hooks/use-subscription';

/**
 * Renders a feature only when the customer's effective plan includes it.
 *
 * Otherwise it shows what the feature is, which plan unlocks it and how much
 * that plan costs, plus a button to go upgrade. A blocked feature must never
 * look like a broken or empty page.
 */

export type GatedFeature = keyof PlanFeatures;

/**
 * The cheapest plan that includes a feature (drives the upgrade message).
 *
 * Takes the list so the caller can pass the LIVE price list (Planes) instead of the
 * compiled-in catalogue: a message that quotes the old price is worse than no message.
 */
export function planUnlocking(
  feature: GatedFeature,
  plans: PlanDefinition[] = PLAN_LIST,
): PlanDefinition | undefined {
  return plans.find((plan) => plan.features[feature]);
}

export default function PlanGate({
  feature,
  title,
  description,
  children,
}: {
  feature: GatedFeature;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { data: subscription, isLoading } = useSubscription();
  const { data: livePlans } = usePlans();

  // While the plan is loading, render the children: every one of these
  // features is also enforced server-side, and flashing a lock on each load
  // would be worse than the occasional 402.
  if (isLoading || !subscription) {
    return <>{children}</>;
  }

  if (subscription.plan.features[feature]) {
    return <>{children}</>;
  }

  const plan = planUnlocking(feature, livePlans && livePlans.length > 0 ? livePlans : undefined);

  return (
    <Card className="border-dashed bg-gray-50" data-testid={`plan-gate-${feature}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700">
          Disponible desde el plan <strong>{plan?.name ?? 'Pro'}</strong>
          {plan ? ` (S/ ${plan.priceAnnual} al año)` : ''}. Su plan actual es{' '}
          <strong>{subscription.plan.name}</strong>.
        </p>
        <Link href="/plan">
          <Button className="btn-primary" data-testid={`button-upgrade-${feature}`}>
            Ver planes y mejorar
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
