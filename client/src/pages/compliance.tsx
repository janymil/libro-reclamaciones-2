import AppLayout from "@/components/layout/app-layout";
import ComplianceMonitor from "@/components/compliance/compliance-monitor";

export default function Compliance() {
  return (
    <AppLayout title="Cumplimiento Legal" subtitle="Monitor de conformidad normativa y protección de datos">
      <ComplianceMonitor />
    </AppLayout>
  );
}
