import AppLayout from "@/components/layout/app-layout";
import EstablishmentList from "@/components/establishments/establishment-list";

export default function Establishments() {
  return (
    <AppLayout title="Gestión de Establecimientos" subtitle="Configure los locales donde debe implementar el Libro de Reclamaciones">
      <EstablishmentList />
    </AppLayout>
  );
}
