import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Building2, HelpCircle, Info } from "lucide-react";
import klettLogo from "@/assets/klett-logo.png";

export default function FaleConosco() {
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/90 p-5 md:p-8 text-primary-foreground">
          <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute bottom-2 right-12 w-12 h-12 bg-accent/20 rounded-lg rotate-12" />
          
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <img src={klettLogo} alt="Klett" className="h-8 md:h-10 bg-white rounded-md p-1.5" />
            </div>
            
            <h1 className="text-xl md:text-2xl font-bold mb-2">
              Fale Conosco
            </h1>
            
            <p className="text-sm md:text-base opacity-90">
              Estamos aqui para ajudar você. Entre em contato conosco pelos canais abaixo.
            </p>
          </div>
        </div>

        {/* Contact Options */}
        <Card className="bg-muted/50 border-0">
          <CardContent className="p-4 md:p-6">
            <h2 className="text-lg font-bold text-foreground mb-4 text-center">
              Como podemos ajudar?
            </h2>
            
            <div className="flex flex-col gap-3">
              <Button variant="outline" className="w-full h-14 text-sm font-medium justify-start gap-3" asChild>
                <a href="https://klett.com.br/sobre-nos" target="_blank" rel="noopener noreferrer">
                  <Info className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold">Sobre nós</div>
                    <div className="text-xs text-muted-foreground">Conheça nossa história</div>
                  </div>
                </a>
              </Button>
              
              <Button variant="outline" className="w-full h-14 text-sm font-medium justify-start gap-3" asChild>
                <a href="https://klett.com.br/unidades" target="_blank" rel="noopener noreferrer">
                  <Building2 className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold">Nossas unidades</div>
                    <div className="text-xs text-muted-foreground">Encontre a unidade mais próxima</div>
                  </div>
                </a>
              </Button>
              
              <Button variant="outline" className="w-full h-14 text-sm font-medium justify-start gap-3" asChild>
                <a href="https://klett.com.br/faq" target="_blank" rel="noopener noreferrer">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="font-semibold">Perguntas frequentes</div>
                    <div className="text-xs text-muted-foreground">Tire suas dúvidas</div>
                  </div>
                </a>
              </Button>
              
              <Button 
                className="w-full h-14 text-sm font-medium justify-start gap-3 bg-whatsapp hover:bg-whatsapp/90 text-white"
                asChild
              >
                <a href="https://wa.me/553135571127?text=Olá%20Klett" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Fale no WhatsApp do Klett</div>
                    <div className="text-xs opacity-90">Atendimento rápido e prático</div>
                  </div>
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card className="border border-border">
          <CardContent className="p-4 md:p-6 text-center">
            <h3 className="font-semibold text-foreground mb-2">Horário de Atendimento</h3>
            <p className="text-sm text-muted-foreground">
              Segunda a Sexta: 6h às 18h<br />
              Sábado: 6h às 12h
            </p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
