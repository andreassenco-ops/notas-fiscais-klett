import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, User, Settings, UserSearch, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePatientAuth } from "@/contexts/PatientAuthContext";
import klettLogo from "@/assets/klett-logo.png";

interface MobileLayoutProps {
  children: React.ReactNode;
}

const mobileNavigation = [
  { name: "Resultados", href: "/paciente", icon: UserSearch },
  { name: "Perfil", href: "/perfil", icon: User },
  { name: "Configurações", href: "/settings", icon: Settings },
];

const topMenuLinks = [
  { name: "Resultados", href: "/paciente", external: false },
  { name: "Cartão Klett", href: "/cartao-klett", external: false },
  { name: "Fale Conosco", href: "/fale-conosco", external: false },
];

export function MobileLayout({ children }: MobileLayoutProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { patient, logout } = usePatientAuth();

  // Scroll to top when route changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top accent bar - Klett teal */}
      <div className="h-1.5 bg-primary" />
      
      {/* Mobile Header - White like the Klett website */}
      <header className="sticky top-0 z-40">
        {/* Banner with logo and hamburger */}
        <div className="bg-white border-b border-border shadow-sm flex items-center justify-between h-14 px-4">
          {/* Logo */}
          <Link to="/paciente" className="flex items-center">
            <img 
              src={klettLogo} 
              alt="Klett - Laboratório de Análises Clínicas" 
              className="h-10 w-auto"
            />
          </Link>

          {/* Hamburger Menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-primary hover:bg-primary/10"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-white">
              <SheetHeader className="pb-6 border-b">
                <SheetTitle className="flex items-center justify-center">
                  <img 
                    src={klettLogo} 
                    alt="Klett" 
                    className="h-10 w-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              
              {/* Patient Info */}
              {patient && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium truncate">{patient.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    CPF: {patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                  </p>
                </div>
              )}
              
              {/* Navigation Links */}
              <nav className="flex flex-col gap-1 mt-6">
                {mobileNavigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                        "text-foreground/80 hover:bg-muted hover:text-foreground",
                        isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
                
                <Separator className="my-2" />
                
                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-destructive hover:bg-destructive/10 w-full text-left"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">Sair</span>
                </button>
              </nav>

              {/* Footer in Sheet */}
              <div className="absolute bottom-6 left-4 right-4">
                <p className="text-xs text-muted-foreground text-center">
                  Klett Laboratório de Análises
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        {/* Shortcuts bar - below the banner with light blue */}
        <div className="bg-primary/10 flex items-center justify-center gap-4 py-2 text-xs border-b border-primary/20">
          {topMenuLinks.map((link) => {
            const isActive = link.href.startsWith("/") && location.pathname.startsWith(link.href.split("#")[0]);
            const activeClass = isActive 
              ? "bg-primary text-primary-foreground px-3 py-1 rounded-full" 
              : "text-primary hover:text-primary/80 px-2 py-1";
            
            return link.external ? (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`transition-colors font-medium ${activeClass}`}
              >
                {link.name}
              </a>
            ) : (
              <Link
                key={link.name}
                to={link.href}
                className={`transition-colors font-medium ${activeClass}`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-4 pb-16">{children}</div>
      </main>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-3 px-4 text-center text-sm">
        <p className="font-medium">Klett, Nossa história é cuidar de você</p>
      </footer>
    </div>
  );
}
