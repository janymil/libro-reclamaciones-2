import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Building2, Book, Upload, ExternalLink, Search } from "lucide-react";

interface BusinessData {
  ruc: string;
  businessName: string;
  commercialName: string;
  phone: string;
  address: string;
  distrito: string;
  provincia: string;
  departamento: string;
  website?: string;
}

interface LibroData {
  libroName: string;
  urlSlug: string;
  businessType: string;
  notificationEmail: string;
  whatsappNumber?: string;
  websiteUrl?: string;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [isLoadingRUC, setIsLoadingRUC] = useState(false);

  // Redirect if not authenticated or onboarding already completed
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/auth');
    } else if (user?.onboardingCompleted) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, user, setLocation]);

  // Business form state
  const [businessForm, setBusinessForm] = useState<BusinessData>({
    ruc: '',
    businessName: '',
    commercialName: '',
    phone: '',
    address: '',
    distrito: '',
    provincia: '',
    departamento: '',
    website: ''
  });

  // Libro configuration form state
  const [libroForm, setLibroForm] = useState<LibroData>({
    libroName: '',
    urlSlug: '',
    businessType: 'tienda_virtual',
    notificationEmail: '',
    whatsappNumber: '',
    websiteUrl: ''
  });

  // RUC lookup function
  const lookupRUC = async (ruc: string) => {
    if (ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      return;
    }

    setIsLoadingRUC(true);
    try {
      const response = await fetch(`/api/lookup-ruc/${ruc}`);
      const data = await response.json();
      
      console.log('RUC lookup response:', data); // Debug log
      
      if (response.ok && data && data.razon_social) {
        setBusinessForm(prev => ({
          ...prev,
          businessName: data.razon_social
        }));
        toast({
          title: "RUC encontrado",
          description: `Razón social: ${data.razon_social}`,
          variant: "default",
        });
      } else {
        toast({
          title: "RUC no encontrado",
          description: data.message || "No se pudo encontrar información para este RUC",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error looking up RUC:', error);
      toast({
        title: "Error",
        description: "No se pudo consultar el RUC. Ingrésalo manualmente.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRUC(false);
    }
  };

  // Handle RUC input change with automatic lookup
  const handleRUCChange = (value: string) => {
    setBusinessForm(prev => ({ ...prev, ruc: value }));
    
    // Automatic lookup when RUC is complete
    if (value.length === 11 && /^\d+$/.test(value)) {
      lookupRUC(value);
    }
  };

  // Complete onboarding mutation
  const onboardingMutation = useMutation({
    mutationFn: async (data: { businessData: BusinessData; libroData: LibroData }) => {
      const response = await apiRequest('POST', '/api/auth/complete-onboarding', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "¡Configuración completada!",
        description: "Tu libro de reclamaciones está listo para usar",
      });
      setLocation('/dashboard');
    },
    onError: (error: Error) => {
      toast({
        title: "Error al completar configuración",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleBusinessNext = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate RUC (11 digits)
    if (businessForm.ruc.length !== 11 || !/^\d+$/.test(businessForm.ruc)) {
      toast({
        title: "RUC inválido",
        description: "El RUC debe tener exactamente 11 dígitos",
        variant: "destructive",
      });
      return;
    }
    
    // Auto-generate some fields for libro form
    setLibroForm(prev => ({
      ...prev,
      libroName: businessForm.commercialName || businessForm.businessName,
      urlSlug: (businessForm.commercialName || businessForm.businessName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
      notificationEmail: user?.email || '',
      websiteUrl: businessForm.website
    }));
    
    setStep(2);
  };

  const handleLibroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate URL slug
    if (!/^[a-z0-9-]+$/.test(libroForm.urlSlug)) {
      toast({
        title: "URL inválida",
        description: "La URL solo puede contener letras minúsculas, números y guiones",
        variant: "destructive",
      });
      return;
    }
    
    onboardingMutation.mutate({
      businessData: businessForm,
      libroData: libroForm
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          
          {/* Progress indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                1
              </div>
              <div className={`w-16 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                2
              </div>
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Datos de la empresa</span>
              <span>Configurar libro</span>
            </div>
          </div>

          {/* Step 1: Business Information */}
          {step === 1 && (
            <Card className="shadow-2xl border-0">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">Datos de tu empresa</CardTitle>
                <CardDescription>
                  Ingresa la información de tu empresa para configurar el libro de reclamaciones
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleBusinessNext} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ruc">RUC *</Label>
                      <div className="relative">
                        <Input
                          id="ruc"
                          data-testid="input-ruc"
                          type="text"
                          value={businessForm.ruc}
                          onChange={(e) => handleRUCChange(e.target.value)}
                          required
                          placeholder="20123456789"
                          maxLength={11}
                          className={isLoadingRUC ? "pr-10" : ""}
                        />
                        {isLoadingRUC && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <Search className="h-4 w-4 animate-spin text-blue-600" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="businessName">Razón Social *</Label>
                      <Input
                        id="businessName"
                        data-testid="input-businessName"
                        type="text"
                        value={businessForm.businessName}
                        onChange={(e) => setBusinessForm({...businessForm, businessName: e.target.value})}
                        required
                        placeholder="Mi Empresa S.A.C."
                        disabled={isLoadingRUC}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="commercialName">Nombre Comercial <span className="text-gray-500">(opcional)</span></Label>
                    <Input
                      id="commercialName"
                      data-testid="input-commercialName"
                      type="text"
                      value={businessForm.commercialName}
                      onChange={(e) => setBusinessForm({...businessForm, commercialName: e.target.value})}
                      placeholder="Mi Negocio"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono *</Label>
                    <Input
                      id="phone"
                      data-testid="input-phone"
                      type="text"
                      value={businessForm.phone}
                      onChange={(e) => setBusinessForm({...businessForm, phone: e.target.value})}
                      required
                      placeholder="01 2345678 o 987654321"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección *</Label>
                    <Input
                      id="address"
                      data-testid="input-address"
                      type="text"
                      value={businessForm.address}
                      onChange={(e) => setBusinessForm({...businessForm, address: e.target.value})}
                      required
                      placeholder="Av. Javier Prado 123, Urbanización San Borja"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="distrito">Distrito *</Label>
                      <Input
                        id="distrito"
                        data-testid="input-distrito"
                        type="text"
                        value={businessForm.distrito}
                        onChange={(e) => setBusinessForm({...businessForm, distrito: e.target.value})}
                        required
                        placeholder="San Borja"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="provincia">Provincia *</Label>
                      <Input
                        id="provincia"
                        data-testid="input-provincia"
                        type="text"
                        value={businessForm.provincia}
                        onChange={(e) => setBusinessForm({...businessForm, provincia: e.target.value})}
                        required
                        placeholder="Lima"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="departamento">Departamento *</Label>
                      <Input
                        id="departamento"
                        data-testid="input-departamento"
                        type="text"
                        value={businessForm.departamento}
                        onChange={(e) => setBusinessForm({...businessForm, departamento: e.target.value})}
                        required
                        placeholder="Lima"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Sitio Web (opcional)</Label>
                    <Input
                      id="website"
                      data-testid="input-website"
                      type="url"
                      value={businessForm.website}
                      onChange={(e) => setBusinessForm({...businessForm, website: e.target.value})}
                      placeholder="https://miempresa.com"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    data-testid="button-next"
                  >
                    Continuar con la configuración del libro
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Libro Configuration */}
          {step === 2 && (
            <Card className="shadow-2xl border-0">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                  <Book className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">Configurar tu Libro</CardTitle>
                <CardDescription>
                  Configura los detalles de tu libro de reclamaciones digital
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleLibroSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="libroName">Nombre del libro *</Label>
                    <Input
                      id="libroName"
                      data-testid="input-libroName"
                      type="text"
                      value={libroForm.libroName}
                      onChange={(e) => setLibroForm({...libroForm, libroName: e.target.value})}
                      required
                      placeholder="Libro de Reclamaciones - Mi Empresa"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="urlSlug">URL de acceso público *</Label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">librovirtual.pe/</span>
                      <Input
                        id="urlSlug"
                        data-testid="input-urlSlug"
                        type="text"
                        value={libroForm.urlSlug}
                        onChange={(e) => setLibroForm({...libroForm, urlSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})}
                        required
                        placeholder="mi-empresa"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Esta será la URL donde tus clientes podrán acceder al libro
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessType">Tipo de negocio *</Label>
                    <Select value={libroForm.businessType} onValueChange={(value) => setLibroForm({...libroForm, businessType: value})}>
                      <SelectTrigger data-testid="select-businessType">
                        <SelectValue placeholder="Selecciona el tipo de negocio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tienda_virtual">Tienda Virtual/E-commerce</SelectItem>
                        <SelectItem value="local_fisico">Local Físico</SelectItem>
                        <SelectItem value="servicios">Servicios</SelectItem>
                        <SelectItem value="mixto">Mixto (Físico + Virtual)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notificationEmail">Email para notificaciones *</Label>
                    <Input
                      id="notificationEmail"
                      data-testid="input-notificationEmail"
                      type="email"
                      value={libroForm.notificationEmail}
                      onChange={(e) => setLibroForm({...libroForm, notificationEmail: e.target.value})}
                      required
                      placeholder="reclamaciones@miempresa.com"
                    />
                    <p className="text-xs text-gray-500">
                      Aquí recibirás las notificaciones de nuevas reclamaciones
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber">WhatsApp (opcional)</Label>
                      <Input
                        id="whatsappNumber"
                        data-testid="input-whatsappNumber"
                        type="text"
                        value={libroForm.whatsappNumber}
                        onChange={(e) => setLibroForm({...libroForm, whatsappNumber: e.target.value})}
                        placeholder="+51 999 123 456"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Sitio Web (opcional)</Label>
                      <Input
                        id="websiteUrl"
                        data-testid="input-websiteUrl"
                        type="url"
                        value={libroForm.websiteUrl}
                        onChange={(e) => setLibroForm({...libroForm, websiteUrl: e.target.value})}
                        placeholder="https://miempresa.com"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">Vista previa</h4>
                    <div className="space-y-1 text-sm text-blue-800">
                      <p><strong>URL pública:</strong> librovirtual.pe/{libroForm.urlSlug}</p>
                      <p><strong>Nombre:</strong> {libroForm.libroName}</p>
                      <p><strong>Tipo:</strong> {libroForm.businessType.replace('_', ' ')}</p>
                    </div>
                  </div>

                  <div className="flex space-x-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setStep(1)}
                      className="flex-1"
                      data-testid="button-back"
                    >
                      Volver
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      disabled={onboardingMutation.isPending}
                      data-testid="button-complete"
                    >
                      {onboardingMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Finalizando...
                        </>
                      ) : (
                        "Finalizar configuración"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}