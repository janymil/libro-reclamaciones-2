import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import ComplaintForm from "@/components/complaints/complaint-form";
import { Card, CardContent } from "@/components/ui/card";

export default function PublicPortal() {
  const { businessId } = useParams();

  const { data: businessInfo, isLoading, error } = useQuery({
    queryKey: ['/api/public/business', businessId],
    queryFn: async () => {
      const response = await fetch(`/api/public/business/${businessId}`);
      if (!response.ok) {
        throw new Error('Business not found');
      }
      return response.json();
    },
    enabled: !!businessId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !businessInfo) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <span className="material-icons text-4xl text-red-500 mb-4">error</span>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Empresa no encontrada</h1>
            <p className="text-gray-600">
              La empresa que busca no existe o no tiene un Libro de Reclamaciones configurado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const defaultEstablishment = businessInfo.establishments?.[0];

  return (
    <div className="min-h-screen bg-surface py-8 px-4" data-testid="public-portal">
      <ComplaintForm
        businessId={businessInfo.business.id}
        establishmentId={defaultEstablishment?.id}
        businessInfo={businessInfo.business}
        establishmentInfo={defaultEstablishment}
        onSuccess={(result) => {
          // Redirect to success page or show confirmation
          alert(`Su reclamación ha sido registrada con el número ${result.correlativeNumber}`);
        }}
      />
    </div>
  );
}
