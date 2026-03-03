import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePatientAuth } from "@/contexts/PatientAuthContext";

interface RequirePatientAuthProps {
  children: React.ReactNode;
}

export function RequirePatientAuth({ children }: RequirePatientAuthProps) {
  const { isAuthenticated, isLoading } = usePatientAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, saving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
