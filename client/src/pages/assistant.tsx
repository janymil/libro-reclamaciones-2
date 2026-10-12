import AppLayout from "@/components/layout/app-layout";
import ComplianceAgentChat from "@/components/ai/compliance-agent-chat";

export default function AssistantPage() {
  return (
    <AppLayout
      title="Copiloto de Cumplimiento"
      subtitle="Asistente de IA especializado en el Libro de Reclamaciones e INDECOPI"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="compliance-agent">
        <ComplianceAgentChat className="h-[34rem]" />
        <p className="px-1 text-xs text-gray-500">
          El asistente ofrece orientación informativa y no constituye asesoría legal vinculante. Verifique
          siempre la norma citada antes de tomar decisiones.
        </p>
      </div>
    </AppLayout>
  );
}
