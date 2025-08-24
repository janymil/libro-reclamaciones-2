import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Loader2, Mail, Lock, UserPlus, LogIn, Shield } from "lucide-react";

type AuthMode = 'login' | 'register' | 'email-sent';

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
}

interface LoginData {
  email: string;
  password: string;
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Registration form state
  const [registerForm, setRegisterForm] = useState<RegisterData>({
    firstName: '',
    lastName: '',
    email: ''
  });

  // Login form state
  const [loginForm, setLoginForm] = useState<LoginData>({
    email: '',
    password: ''
  });

  // Registration mutation (Step 1 of onboarding)
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const response = await apiRequest('POST', '/api/auth/register', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "¡Cuenta creada exitosamente!",
        description: data.message,
      });
      setMode('email-sent');
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear cuenta",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest('POST', '/api/auth/login', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "¡Inicio de sesión exitoso!",
        description: "Bienvenido a LibroVirtual.pe",
      });
      
      // Check onboarding status
      if (!data.user.onboardingCompleted) {
        setLocation('/onboarding');
      } else {
        setLocation('/dashboard');
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error al iniciar sesión",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(registerForm);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="grid lg:grid-cols-2 gap-8 w-full max-w-6xl">
            
            {/* Left side - Form */}
            <div className="flex items-center justify-center">
              <Card className="w-full max-w-md shadow-2xl border-0">
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-4 w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    LibroVirtual.pe
                  </CardTitle>
                  <CardDescription className="text-gray-600">
                    {mode === 'login' && "Inicia sesión en tu cuenta"}
                    {mode === 'register' && "Crea tu cuenta empresarial"}
                    {mode === 'email-sent' && "Revisa tu correo electrónico"}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  {mode === 'register' && (
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">Nombre</Label>
                          <Input
                            id="firstName"
                            data-testid="input-firstName"
                            type="text"
                            value={registerForm.firstName}
                            onChange={(e) => setRegisterForm({...registerForm, firstName: e.target.value})}
                            required
                            placeholder="Tu nombre"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Apellido</Label>
                          <Input
                            id="lastName"
                            data-testid="input-lastName"
                            type="text"
                            value={registerForm.lastName}
                            onChange={(e) => setRegisterForm({...registerForm, lastName: e.target.value})}
                            required
                            placeholder="Tu apellido"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email empresarial</Label>
                        <Input
                          id="email"
                          data-testid="input-email"
                          type="email"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                          required
                          placeholder="empresa@ejemplo.com"
                        />
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        disabled={registerMutation.isPending}
                        data-testid="button-register"
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creando cuenta...
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Crear cuenta empresarial
                          </>
                        )}
                      </Button>

                      <div className="text-center">
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => setMode('login')}
                          data-testid="link-login"
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          ¿Ya tienes cuenta? Inicia sesión
                        </Button>
                      </div>
                    </form>
                  )}

                  {mode === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="loginEmail">Email</Label>
                        <Input
                          id="loginEmail"
                          data-testid="input-loginEmail"
                          type="email"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                          required
                          placeholder="tu@email.com"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="password">Contraseña</Label>
                        <Input
                          id="password"
                          data-testid="input-password"
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                          required
                          placeholder="Tu contraseña"
                        />
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        disabled={loginMutation.isPending}
                        data-testid="button-login"
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Iniciando sesión...
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-2 h-4 w-4" />
                            Iniciar sesión
                          </>
                        )}
                      </Button>

                      <div className="text-center">
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => setMode('register')}
                          data-testid="link-register"
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          ¿No tienes cuenta? Crear cuenta
                        </Button>
                      </div>
                    </form>
                  )}

                  {mode === 'email-sent' && (
                    <div className="text-center space-y-4">
                      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                        <Mail className="w-8 h-8 text-green-600" />
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          ¡Revisa tu correo!
                        </h3>
                        <p className="text-sm text-gray-600">
                          Te hemos enviado tu contraseña de acceso al email: 
                          <br />
                          <span className="font-medium text-gray-900">{registerForm.email}</span>
                        </p>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800">
                          <strong>Próximos pasos:</strong>
                          <br />
                          1. Revisa tu bandeja de entrada y spam
                          <br />
                          2. Usa tu email y la contraseña recibida para iniciar sesión
                          <br />
                          3. Configura los datos de tu empresa
                        </p>
                      </div>

                      <Button
                        onClick={() => setMode('login')}
                        variant="outline"
                        className="w-full"
                        data-testid="button-go-login"
                      >
                        <LogIn className="mr-2 h-4 w-4" />
                        Ir a iniciar sesión
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right side - Hero section */}
            <div className="hidden lg:flex items-center justify-center p-8">
              <div className="text-center space-y-6 max-w-md">
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold text-gray-900">
                    Gestiona tu
                    <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      Libro de Reclamaciones
                    </span>
                    de forma digital
                  </h1>
                  
                  <p className="text-lg text-gray-600">
                    Cumple con la normativa peruana de forma automática y mantén a tus clientes satisfechos
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 text-left">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Cumplimiento Legal</h3>
                      <p className="text-sm text-gray-600">Siguiendo DS 011-2011-PCM y DS 101-2022-PCM</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">15 Días de Respuesta</h3>
                      <p className="text-sm text-gray-600">Seguimiento automático de plazos legales</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Protección de Datos</h3>
                      <p className="text-sm text-gray-600">Conforme a Ley 29733 de protección de datos</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}