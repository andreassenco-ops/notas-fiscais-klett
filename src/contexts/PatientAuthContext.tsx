import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface PatientData {
  id: number;
  nome: string;
  cpf: string;
  dataNascimento: string;
  celular: string;
  email: string;
}

interface PatientSession {
  patient: PatientData;
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

interface PatientAuthContextType {
  patient: PatientData | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (cpf: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const PatientAuthContext = createContext<PatientAuthContextType | null>(null);

const STORAGE_KEY = "klett_patient_session";

// Parse JWT payload to get expiration
function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PatientSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: PatientSession = JSON.parse(stored);
        
        // Validate stored data has required fields
        if (parsed && parsed.patient?.id && parsed.patient?.cpf && parsed.token) {
          // Check if token is expired
          const now = Date.now();
          if (parsed.expiresAt && parsed.expiresAt < now) {
            console.log("Session expired, clearing");
            localStorage.removeItem(STORAGE_KEY);
          } else {
            setSession(parsed);
          }
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading session:", error);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (cpf: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patient-login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ cpf, password }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || "Erro ao fazer login" };
      }

      if (!data.token) {
        return { success: false, error: "Resposta do servidor inválida" };
      }

      // Parse token to get expiration
      const payload = parseJwtPayload(data.token);
      const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days default

      const newSession: PatientSession = {
        patient: data.patient,
        token: data.token,
        expiresAt,
      };

      // Save to state and localStorage
      setSession(newSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro de conexão" 
      };
    }
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patient: session?.patient ?? null,
        token: session?.token ?? null,
        isAuthenticated: !!session,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth() {
  const context = useContext(PatientAuthContext);
  if (!context) {
    throw new Error("usePatientAuth must be used within a PatientAuthProvider");
  }
  return context;
}
