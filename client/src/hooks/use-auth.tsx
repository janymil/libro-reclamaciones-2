import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, apiErrorMessage } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  businessId?: string;
  /** Confirmed mailbox (see /acceso/verificar-email). */
  isEmailVerified: boolean;
  /** Shared, publicly known account: no tenant administration. */
  isDemo?: boolean;
  /**
   * Member of the LibroDigital team (see `PLATFORM_ADMIN_EMAILS`), as opposed to
   * a customer. Only such a login may confirm a bank transfer / Yape.
   */
  isPlatformAdmin?: boolean;
  createdAt: string;
}

interface LoginData {
  email: string;
  password: string;
}

/** The six digits from the login-code email. */
interface LoginCodeData {
  email: string;
  code: string;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  /**
   * Proof-of-work CAPTCHA for an endpoint that creates accounts.
   *
   * Optional in the type only because the request is assembled in two steps (see
   * `handleRegister`, which solves the puzzle first and attaches the result):
   * the server rejects a registration that arrives without them.
   */
  captchaToken?: string;
  captchaAnswer?: string;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  loginMutation: UseMutationResult<{ user: User; message: string }, Error, LoginData>;
  logoutMutation: UseMutationResult<{ message: string }, Error, void>;
  registerMutation: UseMutationResult<{ message: string; nextStep: string; userId: string }, Error, RegisterData>;
  /** Code login step 1: ask for a one-time code by email. */
  requestLoginCodeMutation: UseMutationResult<{ message: string }, Error, string>;
  /** Code login step 2: exchange the six digits for a session. */
  loginWithCodeMutation: UseMutationResult<{ user: User; message: string }, Error, LoginCodeData>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  
  // Get current user
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/auth/user");
        return await response.json();
      } catch (error: any) {
        // If 401, user is not authenticated - return null instead of throwing
        if (error.message.includes("401")) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const response = await apiRequest("POST", "/api/auth/login", credentials);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      toast({
        title: "¡Inicio de sesión exitoso!",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al iniciar sesión",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Code login ("entra con un código por email"). Two mutations instead of one
  // state machine: the page shows the "enter the digits" step between them, and
  // the failure of either one is rendered next to the form.
  const requestLoginCodeMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/request-code", { email });
      return await response.json();
    },
  });

  const loginWithCodeMutation = useMutation({
    mutationFn: async (credentials: LoginCodeData) => {
      const response = await apiRequest("POST", "/api/auth/login-with-code", credentials);
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      toast({
        title: "¡Inicio de sesión exitoso!",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo entrar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterData) => {
      const response = await apiRequest("POST", "/api/auth/register", credentials);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "¡Cuenta creada exitosamente!",
        description: data.message,
      });
    },
    onError: () => {
      // Deliberately silent: /acceso renders this failure inline, next to the
      // form (notice-register-error), where it can offer the way forward -
      // "sign in" or "reset your password" - instead of vanishing in a toast.
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], null);
      // Clear all query cache
      queryClient.clear();
      toast({
        title: "Sesión cerrada",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al cerrar sesión",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        isAuthenticated: !!user,
        loginMutation,
        logoutMutation,
        registerMutation,
        requestLoginCodeMutation,
        loginWithCodeMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}