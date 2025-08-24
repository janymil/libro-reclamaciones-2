import AppLayout from "@/components/layout/app-layout";
import ComplaintTable from "@/components/complaints/complaint-table";

export default function Complaints() {
  return (
    <AppLayout title="Gestión de Reclamaciones" subtitle="Administre todas las reclamaciones y quejas">
      <ComplaintTable showFilters={true} />
    </AppLayout>
  );
}
