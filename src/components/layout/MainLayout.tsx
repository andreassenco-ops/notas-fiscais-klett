import { Sidebar } from "./Sidebar";
import { MobileLayout } from "./MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";

interface MainLayoutProps {
  children: React.ReactNode;
  /** Force mobile layout regardless of screen size */
  forceMobile?: boolean;
}

export function MainLayout({ children, forceMobile }: MainLayoutProps) {
  const isMobile = useIsMobile();

  if (isMobile || forceMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
