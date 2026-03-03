import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  List,
  History,
  Settings,
  Smartphone,
  UserSearch,
  CreditCard,
  MessageCircle,
  ExternalLink,
  LogOut,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import klettLogo from "@/assets/klett-logo.png";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "WhatsApp", href: "/whatsapp", icon: Smartphone },
  { name: "Modelos", href: "/models", icon: FileText },
  { name: "Fila de Envios", href: "/queue", icon: List },
  { name: "Histórico", href: "/history", icon: History },
  { name: "Paciente", href: "/paciente", icon: UserSearch },
  { name: "Notas Fiscais", href: "/notas-fiscais", icon: Receipt },
  { name: "Configurações", href: "/settings", icon: Settings },
];

const shortcuts = [
  { name: "Cartão Klett", href: "/cartao-klett", icon: CreditCard, external: false },
  { name: "Fale Conosco", href: "https://klett.com.br/fale-conosco", icon: MessageCircle, external: true },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAdminAuth();

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login");
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-20 items-center justify-center px-4 border-b border-sidebar-border bg-white">
        <Link to="/">
          <img 
            src={klettLogo} 
            alt="Klett - Laboratório de Análises Clínicas" 
            className="h-14 w-auto"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "sidebar-link",
                isActive && "sidebar-link-active"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
        
        {/* Shortcuts divider */}
        <div className="my-3 border-t border-sidebar-border" />
        <span className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider mb-1">
          Atalhos
        </span>
        
        {shortcuts.map((item) => {
          const isActive = !item.external && location.pathname === item.href;
          
          if (item.external) {
            return (
              <a
                key={item.name}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-link group"
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium flex-1">{item.name}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </a>
            );
          }
          
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "sidebar-link",
                isActive && "sidebar-link-active"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sm font-medium text-sidebar-foreground">
              {user?.email?.[0]?.toUpperCase() || "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email?.split("@")[0] || "Admin"}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              Administrador
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
