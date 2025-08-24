import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  businessId?: string;
  createdAt: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
}

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  loginMutation: UseMutationResult<{ user: User; message: string }, Error, LoginData>;
  logoutMutation: UseMutationResult<{ message: string }, Error, void>;
  registerMutation: UseMutationResult<{ message: string; nextStep: string; userId: string }, Error, RegisterData>;
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
        description: error.message,
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
    onError: (error: Error) => {
      toast({
        title: "Error al crear cuenta",
        description: error.message,
        variant: "destructive",
      });
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