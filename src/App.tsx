import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { PatientAuthProvider } from "@/contexts/PatientAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { RequirePatientAuth } from "@/components/auth/RequirePatientAuth";
import { RequireAdminAuth } from "@/components/auth/RequireAdminAuth";
import Dashboard from "./pages/Dashboard";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import Models from "./pages/Models";
import ModelEdit from "./pages/ModelEdit";
import Queue from "./pages/Queue";
import SendHistory from "./pages/SendHistory";
import PatientLookup from "./pages/PatientLookup";
import PatientLogin from "./pages/PatientLogin";
import AdminLogin from "./pages/AdminLogin";
import Settings from "./pages/Settings";
import CartaoKlett from "./pages/CartaoKlett";
import CartaoKlettCheckout from "./pages/CartaoKlettCheckout";
import FaleConosco from "./pages/FaleConosco";
import NotasFiscais from "./pages/NotasFiscais";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Component to handle mobile redirect from home
function HomeRoute() {
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return <Navigate to="/paciente" replace />;
  }
  
  return (
    <RequireAdminAuth>
      <Dashboard />
    </RequireAdminAuth>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AdminAuthProvider>
        <PatientAuthProvider>
          <Toaster />
          <Sonner position="top-right" />
          <BrowserRouter>
            <Routes>
              {/* Admin routes - protected */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route 
                path="/whatsapp" 
                element={
                  <RequireAdminAuth>
                    <WhatsAppConnection />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/models" 
                element={
                  <RequireAdminAuth>
                    <Models />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/models/:id" 
                element={
                  <RequireAdminAuth>
                    <ModelEdit />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/templates" 
                element={
                  <RequireAdminAuth>
                    <Models />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/queue" 
                element={
                  <RequireAdminAuth>
                    <Queue />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/history" 
                element={
                  <RequireAdminAuth>
                    <SendHistory />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/notas-fiscais" 
                element={
                  <RequireAdminAuth>
                    <NotasFiscais />
                  </RequireAdminAuth>
                } 
              />
              <Route 
                path="/settings" 
                element={
                  <RequireAdminAuth>
                    <Settings />
                  </RequireAdminAuth>
                } 
              />

              {/* Patient routes - separate auth */}
              <Route path="/login" element={<PatientLogin />} />
              <Route 
                path="/paciente" 
                element={
                  <RequirePatientAuth>
                    <PatientLookup />
                  </RequirePatientAuth>
                } 
              />

              {/* Public routes */}
              <Route path="/cartao-klett" element={<CartaoKlett />} />
              <Route path="/cartao-klett/assinar" element={<CartaoKlettCheckout />} />
              <Route path="/fale-conosco" element={<FaleConosco />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PatientAuthProvider>
      </AdminAuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
