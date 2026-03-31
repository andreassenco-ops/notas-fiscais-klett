import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileLayout } from "./MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  forceMobile?: boolean;
}

export function MainLayout({ children, forceMobile }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (isMobile || forceMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className={cn("transition-all duration-200", collapsed ? "pl-14" : "pl-48")}>
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
