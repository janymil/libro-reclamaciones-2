import { Progress } from "@/components/ui/progress";

/**
 * One quota line: "usado / límite", with a bar unless the limit is unlimited.
 *
 * Shared by "Plan y Cuotas" and the company section of "Mi Perfil" so a plan
 * limit is described and measured the same way wherever it is shown.
 */
export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const percent = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium">
          {used}{unlimited ? '' : ` / ${limit}`} {unlimited && <span className="text-green-600">· ilimitado</span>}
        </span>
      </div>
      {!unlimited && <Progress value={percent} className="h-2" />}
    </div>
  );
}
