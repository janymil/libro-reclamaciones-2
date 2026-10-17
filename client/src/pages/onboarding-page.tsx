import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { invalidateTenantQueries } from "@/lib/tenant-queries";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Building2, Book, Search } from "lucide-react";
import { libroSlugFrom } from "@shared/slug";
import { firstIdentificationCode, type SalesChannel } from "@shared/establishments";
import {
  LOCALES_SCENARIOS,
  expectedLocales,
  scenarioFor,
  suggestedEstablishmentName,
  type LocalesScenario,
} from "@/lib/locales-plan";
import WhatWillBeCreated from "@/components/onboarding/what-will-be-created";
import { departments, getProvinces, getDistricts } from '@/data/peru-locations';
import { resolvePeruLocation } from '@/lib/location-matcher';
import { safeInternalPath } from "@/lib/subscribe-link";

interface BusinessData {
  ruc: string;
  businessName: string;
  commercialName: string;
  phone: string;
  address: string;
  distrito: string;
  provincia: string;
  departamento: string;
  /**
   * How many locales the company says it will have (casa matriz included), or
   * undefined when it never declared one. Stored with the tenant so the
   * "Primeros pasos" checklist can count from any device.
   */
  expectedEstablishments?: number;
}

interface LibroData {
  libroName: string;
  urlSlug: string;
  /** Sales channel: decides the establishment code and the Integraciones guide. */
  businessType: SalesChannel;
  notificationEmail: string;
  whatsappNumber?: string;
  websiteUrl?: string;
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [isLoadingRUC, setIsLoadingRUC] = useState(false);
  
  // Location cascading state
  const [availableProvinces, setAvailableProvinces] = useState<string[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);

  // Where to send the user once onboarding is done (for example back to the
  // subscription link they arrived from). Validated to stay on this site.
  const nextPath = safeInternalPath(new URLSearchParams(window.location.search).get('next'));

  // Redirect if not authenticated or onboarding already completed
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation(nextPath ? `/acceso?next=${encodeURIComponent(nextPath)}` : '/acceso');
    } else if (user?.onboardingCompleted) {
      setLocation(nextPath ?? '/panel');
    }
  }, [isAuthenticated, user, setLocation, nextPath]);

  // Business form state
  const [businessForm, setBusinessForm] = useState<BusinessData>({
    ruc: '',
    businessName: '',
    commercialName: '',
    phone: '',
    address: '',
    distrito: '',
    provincia: '',
    departamento: ''
  });

  // Libro configuration form state
  const [libroForm, setLibroForm] = useState<LibroData>({
    libroName: '',
    urlSlug: '',
    // Overridden by the scenario when step 2 opens; the old default was
    // 'tienda_virtual', which labelled a physical shop as an online channel.
    businessType: 'local_fisico',
    notificationEmail: '',
    whatsappNumber: '',
    websiteUrl: ''
  });

  /**
   * "¿Cómo opera tu negocio?" - one local, a casa matriz with sucursales, or
   * online only. It decides how the name field reads (see lib/locales-plan.ts)
   * and what the checklist will track after registration.
   */
  const [scenario, setScenario] = useState<LocalesScenario>('un_local');
  /** Total locales a chain declares, typed in the optional field. */
  const [totalLocales, setTotalLocales] = useState('');
  /** Once the user edits the name/slug by hand, suggestions stop following. */
  const [establishmentNameTouched, setEstablishmentNameTouched] = useState(false);
  const [libroSlugTouched, setLibroSlugTouched] = useState(false);

  /** The chosen scenario, with the labels and hints that go with it. */
  const activeScenario = scenarioFor(scenario);

  /**
   * Resume state.
   *
   * A previous attempt may have written the tenant (or the whole libro) before
   * failing, so the wizard loads whatever already exists instead of asking the
   * user to type it again - and, because the server commits atomically, this is
   * the normal way to finish a partially completed onboarding.
   */
  const { data: existingBusiness } = useQuery<any>({
    queryKey: ['/api/businesses/current'],
    enabled: isAuthenticated,
  });

  const { data: existingLibro } = useQuery<any>({
    queryKey: ['/api/libro-configuration'],
    enabled: isAuthenticated && Boolean(existingBusiness),
  });

  const [isResumed, setIsResumed] = useState(false);

  // Set when the RUC is already registered by another account: the wizard can
  // then offer "solicitar acceso" instead of leaving the user stuck.
  const [accessRequest, setAccessRequest] = useState<{ businessName: string } | null>(null);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);

  // Set when the server refuses to publish because the account's mailbox is not
  // confirmed yet. Same idea: a way forward (resend the link) instead of a toast.
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  // Prefill from whatever a previous attempt already saved. If the libro itself
  // exists, the user only has to confirm it: jump straight to step 2.
  useEffect(() => {
    if (!existingBusiness) return;

    setBusinessForm((prev) => ({
      ...prev,
      ruc: existingBusiness.ruc ?? prev.ruc,
      businessName: existingBusiness.businessName ?? prev.businessName,
      commercialName: existingBusiness.commercialName ?? prev.commercialName,
      phone: existingBusiness.phone ?? prev.phone,
      address: existingBusiness.address ?? prev.address,
      distrito: existingBusiness.distrito ?? prev.distrito,
      provincia: existingBusiness.provincia ?? prev.provincia,
      departamento: existingBusiness.departamento ?? prev.departamento,
    }));

    if (existingBusiness.departamento) {
      setAvailableProvinces(getProvinces(existingBusiness.departamento));
      if (existingBusiness.provincia) {
        setAvailableDistricts(
          getDistricts(existingBusiness.departamento, existingBusiness.provincia),
        );
      }
    }

    setIsResumed(true);
  }, [existingBusiness]);

  useEffect(() => {
    if (!existingLibro) return;

    setLibroForm((prev) => ({
      ...prev,
      libroName: existingLibro.libroName ?? prev.libroName,
      urlSlug: existingLibro.urlSlug ?? prev.urlSlug,
      businessType: existingLibro.businessType ?? prev.businessType,
      notificationEmail: existingLibro.notificationEmail ?? prev.notificationEmail,
      whatsappNumber: existingLibro.whatsappNumber ?? prev.whatsappNumber,
      websiteUrl: existingLibro.websiteUrl ?? prev.websiteUrl,
    }));

    // What is already saved wins: changing the scenario must not overwrite a name
    // or a public URL the customer already chose (PATCH /api/libro-configuration
    // keeps the URL fixed forever).
    setEstablishmentNameTouched(true);
    setLibroSlugTouched(true);

    setStep(2);
  }, [existingLibro]);

  /**
   * Asks the current administrators of the typed RUC for access.
   *
   * The alternative was a permanent 409: a RUC belongs to one tenant, so a
   * second legitimate person (the accountant, a new partner, a replacement
   * employee) could never register it and had nowhere to go.
   */
  const requestAccess = async () => {
    setIsRequestingAccess(true);
    try {
      const response = await apiRequest('POST', '/api/businesses/access-requests', {
        ruc: businessForm.ruc,
      });
      const data = await response.json();
      toast({ title: 'Solicitud enviada', description: data.message });
      setAccessRequest(null);
    } catch (error) {
      toast({
        title: 'No se pudo enviar la solicitud',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsRequestingAccess(false);
    }
  };

  // RUC lookup function
  const lookupRUC = async (ruc: string) => {
    if (ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      return;
    }

    setIsLoadingRUC(true);
    try {
      const response = await fetch(`/api/lookup-ruc/${ruc}`);
      const data = await response.json();
      
      
      if (response.ok && data && data.razon_social) {
        // Resolve the provider's location strings onto our ubigeo dataset.
        // SUNAT spells some of them differently ("PROV. CONST. DEL CALLAO"), and
        // the old strict comparison dropped the value silently - leaving the
        // selects empty even though the lookup had answered.
        const location = resolvePeruLocation(data);
        const provinces = location.departamento ? getProvinces(location.departamento) : [];
        const districts =
          location.departamento && location.provincia
            ? getDistricts(location.departamento, location.provincia)
            : [];

        // Update business form with RUC data
        setBusinessForm(prev => ({
          ...prev,
          businessName: data.razon_social,
          // SUNAT's fiscal address; the user can still correct it.
          address:
            typeof data.direccion === 'string' && data.direccion.trim()
              ? data.direccion.trim()
              : prev.address,
          departamento: location.departamento ?? prev.departamento,
          // Only dataset values are set: an unrecognised name is left empty for
          // the user to pick, instead of a value the select cannot hold.
          provincia: location.provincia ?? (location.departamento ? '' : prev.provincia),
          distrito: location.distrito ?? (location.departamento ? '' : prev.distrito),
        }));

        // Populate the cascading dropdowns with the values just resolved.
        setAvailableProvinces(provinces);
        setAvailableDistricts(districts);

        toast({
          title: "RUC encontrado",
          description: `Razón social: ${data.razon_social}`,
          variant: "default",
        });
      } else {
        // One neutral message for every failure other than "this RUC does not
        // exist". The `code` keeps the technical distinction for support; the
        // text stays free of vendor names and infrastructure details, and never
        // tells the customer our data sources are limited.
        toast({
          title: data?.code === 'ruc_not_found' ? 'RUC no encontrado' : 'No se pudo verificar el RUC',
          description: data?.message || 'Completa los datos de tu empresa manualmente.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error looking up RUC:', error);
      toast({
        title: "Error",
        description: "No se pudo verificar el RUC. Completa los datos manualmente.",
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
    onSuccess: () => {
      // Every tenant query whose answer changed: the wizard itself has already
      // cached `/api/businesses/current` as `null` (the account had no company
      // when it mounted) and the cache is `staleTime: Infinity`. Without this,
      // Mi Perfil - "Mi empresa" kept showing "Aún no ha registrado su empresa"
      // and the header switcher stayed empty until a full reload.
      invalidateTenantQueries(queryClient);
      toast({
        title: "¡Configuración completada!",
        description: "Tu libro de reclamaciones está listo para usar",
      });
      setLocation(nextPath ?? '/panel');
    },
    onError: (error: Error) => {
      const raw = error.message;

      // The RUC belongs to another account: offer the way forward instead of
      // repeating a message the user cannot act on.
      if (raw.includes('ruc_already_registered')) {
        let businessName = 'esa empresa';
        try {
          const body = JSON.parse(raw.replace(/^\d{3}:\s*/, ''));
          if (body?.businessName) businessName = body.businessName;
        } catch {
          // Body was not our JSON envelope: the generic wording is enough.
        }
        setAccessRequest({ businessName });
        return;
      }

      // Already configured (for instance in another tab): nothing to redo.
      if (raw.includes('already_onboarded')) {
        setLocation(nextPath ?? '/panel');
        return;
      }

      // Unconfirmed mailbox: the wizard cannot publish anything yet
      // (services/verificationService.ts), so it needs the way forward, not a
      // toast that disappears.
      if (raw.includes('email_not_verified')) {
        setVerificationRequired(true);
        return;
      }

      toast({
        title: "Error al completar configuración",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    }
  });

  // Handle location changes
  const handleDepartmentChange = (department: string) => {
    // Re-picking the same department must not clear the auto-filled provincia
    // and distrito: that is exactly what made a freshly filled form look empty.
    if (department === businessForm.departamento) return;

    setBusinessForm(prev => ({
      ...prev,
      departamento: department,
      provincia: '',
      distrito: ''
    }));
    setAvailableProvinces(getProvinces(department));
    setAvailableDistricts([]);
  };

  const handleProvinceChange = (province: string) => {
    setBusinessForm(prev => ({
      ...prev,
      provincia: province,
      distrito: ''
    }));
    setAvailableDistricts(getDistricts(businessForm.departamento, province));
  };

  const handleDistrictChange = (district: string) => {
    setBusinessForm(prev => ({
      ...prev,
      distrito: district
    }));
  };

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
    
    // Prefill step 2 from step 1, using the rules of the chosen scenario: one
    // local takes the business's name, while a chain gets "Casa Matriz - <marca>"
    // so nobody types a book title where a place name belongs.
    const suggestion = suggestedEstablishmentName(scenario, businessForm);

    setLibroForm(prev => ({
      ...prev,
      libroName: suggestion || prev.libroName,
      urlSlug: libroSlugFrom(suggestion || prev.libroName),
      // The channel is not left to a default any more: it decides the
      // establishment's identification code and the Integraciones guidance.
      businessType: scenarioFor(scenario).businessType,
      notificationEmail: user?.email || ''
    }));

    setStep(2);
  };

  /**
   * Applies a scenario to the form.
   *
   * The name and the URL follow the suggestion until the customer edits them by
   * hand; the sales channel always follows the scenario, because that is what the
   * server stores in the establishment (a physical one is numbered SUC-001, an
   * online-only tenant gets ONLINE-01).
   */
  const chooseScenario = (next: LocalesScenario) => {
    setScenario(next);

    const suggestion = suggestedEstablishmentName(next, businessForm);
    const nextName = establishmentNameTouched ? libroForm.libroName : suggestion;

    setLibroForm(prev => ({
      ...prev,
      libroName: nextName,
      urlSlug: libroSlugTouched ? prev.urlSlug : libroSlugFrom(nextName),
      businessType: scenarioFor(next).businessType,
    }));
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

    // How many locales the company says it will have, stored WITH the tenant: the
    // "Primeros pasos" checklist can then say "2 de 5" from any device (this used
    // to live in localStorage and was lost when the customer changed machine).
    onboardingMutation.mutate({
      businessData: {
        ...businessForm,
        expectedEstablishments: expectedLocales(scenario, Number(totalLocales)) ?? undefined,
      },
      libroData: libroForm,
    });
  };

  // Asks for a fresh "confirma tu correo" link. The mailbox is the address that
  // will receive every complaint notification, so it has to be real before the
  // Libro goes live.
  const resendVerification = async () => {
    setIsResendingVerification(true);
    try {
      const response = await apiRequest('POST', '/api/auth/resend-verification');
      const body = await response.json();
      toast({ title: 'Enlace enviado', description: body.message });
    } catch (error) {
      toast({
        title: 'No se pudo enviar',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setIsResendingVerification(false);
    }
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

          {/* Resumed: a previous attempt already saved part of this wizard */}
          {isResumed && (
            <div
              className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
              data-testid="notice-onboarding-resumed"
            >
              <p className="font-medium">Recuperamos lo que ya habíamos guardado de tu empresa.</p>
              <p className="mt-1">
                Revisa los datos y continúa donde quedaste: al finalizar, tu Libro queda publicado.
              </p>
            </div>
          )}

          {/* The book cannot be published from an unconfirmed mailbox: the link is
              the way forward, not a message the user cannot act on. */}
          {verificationRequired && (
            <div
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="notice-email-not-verified"
            >
              <p className="font-medium">Confirma tu correo para publicar tu Libro.</p>
              <p className="mt-1">
                Te enviamos un enlace de confirmación cuando creaste tu cuenta. Es la dirección que
                recibirá el aviso de cada reclamación, así que debe estar confirmada antes de
                publicar tu Libro de Reclamaciones.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={isResendingVerification}
                onClick={resendVerification}
                data-testid="button-resend-verification-onboarding"
              >
                {isResendingVerification ? 'Enviando…' : 'Reenviar enlace de confirmación'}
              </Button>
            </div>
          )}

          {/* That RUC belongs to another account: the way forward is asking for access */}
          {accessRequest && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="notice-ruc-taken"
            >
              <p className="font-medium">
                El RUC {businessForm.ruc} ya está registrado en {accessRequest.businessName}.
              </p>
              <p className="mt-1">
                Si trabajas en esa empresa, puedes solicitar acceso: el administrador actual recibirá tu
                pedido y deberá aprobarlo. Mientras tanto, esta empresa no se puede crear de nuevo.
              </p>
              <Button
                type="button"
                onClick={requestAccess}
                disabled={isRequestingAccess}
                className="mt-3"
                data-testid="button-request-access"
              >
                {isRequestingAccess ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  'Solicitar acceso a esta empresa'
                )}
              </Button>
            </div>
          )}

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
                      <Label htmlFor="departamento">Departamento *</Label>
                      <Select value={businessForm.departamento} onValueChange={handleDepartmentChange} required>
                        <SelectTrigger data-testid="select-departamento">
                          <SelectValue placeholder="Seleccionar departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="provincia">Provincia *</Label>
                      <Select 
                        value={businessForm.provincia} 
                        onValueChange={handleProvinceChange} 
                        disabled={!businessForm.departamento}
                        required
                      >
                        <SelectTrigger data-testid="select-provincia">
                          <SelectValue placeholder="Seleccionar provincia" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProvinces.map((prov) => (
                            <SelectItem key={prov} value={prov}>
                              {prov}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="distrito">Distrito *</Label>
                      <Select 
                        value={businessForm.distrito} 
                        onValueChange={handleDistrictChange} 
                        disabled={!businessForm.provincia}
                        required
                      >
                        <SelectTrigger data-testid="select-distrito">
                          <SelectValue placeholder="Seleccionar distrito" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDistricts.map((dist) => (
                            <SelectItem key={dist} value={dist}>
                              {dist}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                  {/* Cómo opera el negocio. Preguntado en los términos del
                      cliente, porque de aquí salen el tipo de canal (código del
                      establecimiento) y el nombre del primer local. */}
                  <div className="space-y-3">
                    <Label>¿Cómo opera tu negocio? *</Label>
                    <div className="grid gap-3 md:grid-cols-3">
                      {LOCALES_SCENARIOS.map((option) => {
                        const selected = option.id === scenario;
                        return (
                          <button
                            type="button"
                            key={option.id}
                            onClick={() => chooseScenario(option.id)}
                            aria-pressed={selected}
                            data-testid={`scenario-${option.id}`}
                            className={`rounded-lg border p-3 text-left transition-colors ${
                              selected
                                ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            }`}
                          >
                            <span className="block text-sm font-medium text-gray-900">
                              {option.title}
                            </span>
                            <span className="mt-1 block text-xs text-gray-600">
                              {option.description}
                            </span>
                            <span className="mt-1 block text-xs text-gray-400">{option.example}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="libroName">{activeScenario.nameLabel} *</Label>
                    <Input
                      id="libroName"
                      data-testid="input-libroName"
                      type="text"
                      value={libroForm.libroName}
                      onChange={(e) => {
                        // Edited by hand: the suggestion stops following the
                        // business name, and the URL follows this name instead.
                        setEstablishmentNameTouched(true);
                        const value = e.target.value;
                        setLibroForm(prev => ({
                          ...prev,
                          libroName: value,
                          urlSlug: libroSlugTouched ? prev.urlSlug : libroSlugFrom(value),
                        }));
                      }}
                      required
                      placeholder={activeScenario.example.replace(/^Ej\.:\s*/, '')}
                    />
                    <p className="text-xs text-gray-500">{activeScenario.nameHint}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="urlSlug">URL de acceso público *</Label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">librodigital.pe/</span>
                      <Input
                        id="urlSlug"
                        data-testid="input-urlSlug"
                        type="text"
                        value={libroForm.urlSlug}
                        onChange={(e) => {
                          setLibroSlugTouched(true);
                          setLibroForm({
                            ...libroForm,
                            urlSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                          });
                        }}
                        required
                        placeholder="mi-empresa"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Un solo enlace para toda tu empresa: tus clientes eligen el local al reclamar.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessType">Tipo de negocio *</Label>
                    <Select
                      value={libroForm.businessType}
                      onValueChange={(value) => setLibroForm({...libroForm, businessType: value as SalesChannel})}
                      // Vendiendo solo por internet el canal es la tienda online:
                      // cambiarlo aquí dejaría el libro identificado como local físico.
                      disabled={scenario === 'solo_online'}
                    >
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
                    <p className="text-xs text-gray-500">
                      {scenario === 'solo_online'
                        ? 'Sin local abierto al público: tu libro se identifica como canal online (ONLINE-01).'
                        : `Define la guía de Integraciones y el código del local (${firstIdentificationCode(libroForm.businessType)}).`}
                    </p>
                  </div>

                  {scenario === 'casa_matriz_sucursales' && (
                    <div className="space-y-2">
                      <Label htmlFor="totalLocales">¿Cuántos locales atenderás en total? (opcional)</Label>
                      <Input
                        id="totalLocales"
                        data-testid="input-totalLocales"
                        type="number"
                        min={2}
                        max={500}
                        value={totalLocales}
                        onChange={(e) => setTotalLocales(e.target.value)}
                        placeholder="5"
                      />
                      <p className="text-xs text-gray-500">
                        Cuenta la casa matriz. Lo usamos para recordarte en el panel los locales que
                        faltan registrar; no bloquea nada.
                      </p>
                    </div>
                  )}

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

                  <WhatWillBeCreated
                    ruc={businessForm.ruc}
                    businessName={businessForm.businessName}
                    establishmentName={libroForm.libroName}
                    businessType={libroForm.businessType}
                    slug={libroForm.urlSlug}
                    notificationEmail={libroForm.notificationEmail}
                    scenario={scenario}
                    extraLocales={expectedLocales(scenario, Number(totalLocales))}
                  />

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