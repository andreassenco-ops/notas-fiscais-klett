import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Heart, CreditCard } from "lucide-react";
import klettLogo from "@/assets/klett-logo.png";

const benefits = [
  "Acesso ao Laboratório Klett com descontos exclusivos",
  "Utilize imediatamente após a adesão",
  "Consultas presenciais e online a partir de R$ 49,00",
  "Exames de sangue com até 60% de desconto",
  "Descontos de até 70% em medicamentos",
];

const basicFeatures = [
  { text: "Exames de laboratório com até 50% de desconto" },
  { text: "Medicamentos com até 70% de desconto" },
  { text: "Vacinas com até 10% de desconto" },
  { text: "Até 4 dependentes sem custo adicional" },
  { text: "Pronto atendimento online sem custo e ilimitado" },
];

const plusFeatures = [
  { text: "Exames de laboratório com até 60% de desconto" },
  { text: "Medicamentos com até 70% de desconto" },
  { text: "Vacinas com até 15% de desconto" },
  { text: "Consultas presenciais no Inez Brandão a partir de R$ 49,00" },
  { text: "Até 4 dependentes sem custo adicional" },
  { text: "Pronto atendimento online sem custo e ilimitado" },
  { text: "Nutricionista e Psicólogo online a partir de R$ 36,00" },
  { text: "Tele Especialidades a partir de R$ 49,50" },
];

export default function CartaoKlett() {
  const navigate = useNavigate();
  
  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Hero Section - Compact */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/90 p-5 md:p-8 text-primary-foreground">
          <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
          <div className="absolute bottom-2 right-12 w-12 h-12 bg-accent/20 rounded-lg rotate-12" />
          
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-2 mb-3">
              <img src={klettLogo} alt="Klett" className="h-8 md:h-10 bg-white rounded-md p-1.5" />
              <span className="text-lg md:text-xl font-bold">+Saúde</span>
            </div>
            
            <h1 className="text-xl md:text-2xl font-bold mb-2">
              Cartão Klett +Saúde
            </h1>
            
            <p className="text-sm md:text-base opacity-90 mb-4">
              Os descontos em exames, vacinas e consultas que você e sua família merecem. 
              A partir de <span className="font-bold text-lg">R$ 39,90</span>/mês.
            </p>
            
            <Button 
              size="sm"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90 text-sm"
              onClick={() => navigate("/cartao-klett/assinar?plan=plus")}
            >
              Assine agora
            </Button>
          </div>
        </div>

        {/* Benefits List - Compact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {benefits.map((benefit, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-accent" />
              </div>
              <span className="text-foreground/80">{benefit}</span>
            </div>
          ))}
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Basic Plan */}
          <Card className="border border-border hover:border-primary/40 transition-colors">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Básico Exames</h3>
                    <p className="text-muted-foreground text-xs">Exames laboratoriais no Klett</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 pb-3 border-b border-border">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-muted-foreground">12x</span>
                  <span className="text-2xl font-bold text-primary">R$ 39,90</span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                {basicFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <Check className="w-3 h-3 mt-0.5 text-success flex-shrink-0" />
                    <span className="text-[11px] leading-tight text-foreground/80">{feature.text}</span>
                  </div>
                ))}
              </div>

              <Button 
                className="w-full" 
                size="sm" 
                onClick={() => navigate("/cartao-klett/assinar?plan=basico")}
              >
                Assine agora
              </Button>
              
              <p className="text-center text-xs text-muted-foreground mt-2">
                ou tire suas dúvidas via{" "}
                <a 
                  href="https://wa.me/553135571127?text=Quero%20saber%20mais%20sobre%20o%20cart%C3%A3o%20Klett" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  WhatsApp
                </a>
              </p>
            </CardContent>
          </Card>

          {/* Plus Plan */}
          <Card className="border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-transparent hover:border-accent/60 transition-colors relative overflow-hidden">
            <div className="absolute top-3 right-3 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              MAIS POPULAR
            </div>
            <CardContent className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Plus</h3>
                    <p className="text-muted-foreground text-xs">Exames e Consultas Médicas</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 pb-3 border-b border-accent/20">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-muted-foreground">12x</span>
                  <span className="text-2xl font-bold text-accent">R$ 59,90</span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-4">
                {plusFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-accent/70" />
                    <span className="text-[11px] leading-tight text-foreground/80">
                      {feature.text}
                    </span>
                  </div>
                ))}
              </div>

              <Button 
                className="w-full bg-accent hover:bg-accent/90 text-white" 
                size="sm"
                onClick={() => navigate("/cartao-klett/assinar?plan=plus")}
              >
                Assine agora
              </Button>
              
              <p className="text-center text-xs text-muted-foreground mt-2">
                ou tire suas dúvidas via{" "}
                <a 
                  href="https://wa.me/553135571127?text=Quero%20saber%20mais%20sobre%20o%20cart%C3%A3o%20Klett" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  WhatsApp
                </a>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground text-center">
          *Valor por mês da assinatura com vínculo anual. Sua assinatura será renovada automaticamente.
        </p>

      </div>
    </MainLayout>
  );
}
