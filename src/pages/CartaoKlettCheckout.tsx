import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Check, 
  CreditCard, 
  Heart, 
  ArrowLeft, 
  QrCode,
  User,
  Phone,
  Mail,
  FileText,
  Users
} from "lucide-react";
import klettLogo from "@/assets/klett-logo.png";

type PlanType = "basico" | "plus";
type PaymentMethod = "pix" | "credit_card";

const plans = {
  basico: {
    name: "Básico Exames",
    price: "39,90",
    description: "Exames laboratoriais no Klett",
    icon: CreditCard,
    popular: false,
    features: [
      "Exames de laboratório com até 50% de desconto",
      "Medicamentos com até 70% de desconto",
      "Vacinas com até 10% de desconto",
      "Até 4 dependentes sem custo adicional",
      "Pronto atendimento online sem custo e ilimitado",
    ],
  },
  plus: {
    name: "Plus",
    price: "59,90",
    description: "Exames e Consultas Médicas",
    icon: Heart,
    popular: true,
    features: [
      "Exames de laboratório com até 60% de desconto",
      "Medicamentos com até 70% de desconto",
      "Vacinas com até 15% de desconto",
      "Consultas presenciais no Inez Brandão a partir de R$ 49,00",
      "Até 4 dependentes sem custo adicional",
      "Pronto atendimento online sem custo e ilimitado",
      "Nutricionista e Psicólogo online a partir de R$ 36,00",
      "Tele Especialidades a partir de R$ 49,50",
    ],
  },
};

export default function CartaoKlettCheckout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlan = (searchParams.get("plan") as PlanType) || "plus";
  
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(initialPlan);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credit_card");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // TODO: Remove default CPF after testing phase
  const [formData, setFormData] = useState({
    nome: "",
    cpf: "07253906624",
    email: "",
    telefone: "",
    dataNascimento: "",
  });

  const currentPlan = plans[selectedPlan];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleContinue = () => {
    if (step < 3) {
      setStep((step + 1) as 1 | 2 | 3);
    } else {
      // Here would be the payment processing
      console.log("Processing payment:", { selectedPlan, paymentMethod, formData });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3);
    } else {
      navigate("/cartao-klett");
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <img src={klettLogo} alt="Klett" className="h-8 bg-white rounded-md p-1" />
            <span className="text-lg font-bold text-primary">+Saúde</span>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-1 mx-1 rounded ${step > s ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 text-xs text-muted-foreground">
          <span className={step === 1 ? "text-primary font-medium" : ""}>Plano</span>
          <span className={step === 2 ? "text-primary font-medium" : ""}>Dados</span>
          <span className={step === 3 ? "text-primary font-medium" : ""}>Pagamento</span>
        </div>

        {/* Step 1: Plan Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">Escolha seu plano</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {(Object.entries(plans) as [PlanType, typeof plans.basico][]).map(([key, plan]) => {
                const Icon = plan.icon;
                const isSelected = selectedPlan === key;
                
                return (
                  <Card 
                    key={key}
                    className={`cursor-pointer transition-all ${
                      isSelected 
                        ? "ring-2 ring-primary border-primary" 
                        : "hover:border-primary/40"
                    } ${plan.popular ? "relative overflow-hidden" : ""}`}
                    onClick={() => setSelectedPlan(key)}
                  >
                    {plan.popular && (
                      <div className="absolute top-2 right-2 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        MAIS POPULAR
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              plan.popular ? "bg-accent/20" : "bg-primary/10"
                            }`}>
                              <Icon className={`w-4 h-4 ${plan.popular ? "text-accent" : "text-primary"}`} />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground">{plan.name}</h3>
                              <p className="text-xs text-muted-foreground">{plan.description}</p>
                            </div>
                          </div>
                          
                          <div className="my-3">
                            <div className="flex items-baseline gap-1">
                              <span className="text-xs text-muted-foreground">12x</span>
                              <span className={`text-xl font-bold ${plan.popular ? "text-accent" : "text-primary"}`}>
                                R$ {plan.price}
                              </span>
                              <span className="text-muted-foreground text-sm">/mês</span>
                            </div>
                          </div>
                          
                          <div className="space-y-1.5">
                            {plan.features.slice(0, 4).map((feature, index) => (
                              <div key={index} className="flex items-start gap-1.5">
                                <Check className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                                  plan.popular ? "text-accent" : "text-success"
                                }`} />
                                <span className="text-[11px] leading-tight text-foreground/80">{feature}</span>
                              </div>
                            ))}
                            {plan.features.length > 4 && (
                              <p className="text-[11px] text-muted-foreground pl-4">
                                +{plan.features.length - 4} benefícios
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Personal Data */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">Seus dados</h2>
            
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Nome completo
                  </Label>
                  <Input
                    id="nome"
                    name="nome"
                    placeholder="Digite seu nome completo"
                    value={formData.nome}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpf" className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      CPF
                    </Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={handleInputChange}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="dataNascimento" className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Data de nascimento
                    </Label>
                    <Input
                      id="dataNascimento"
                      name="dataNascimento"
                      type="date"
                      value={formData.dataNascimento}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      E-mail
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="telefone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Telefone
                    </Label>
                    <Input
                      id="telefone"
                      name="telefone"
                      placeholder="(00) 00000-0000"
                      value={formData.telefone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Payment Method */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">Forma de pagamento</h2>
            
            <Card>
              <CardContent className="p-4">
                <RadioGroup 
                  value={paymentMethod} 
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  className="space-y-3"
                >
                  {/* Credit Card Option */}
                  <label 
                    htmlFor="credit_card"
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      paymentMethod === "credit_card" 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <RadioGroupItem value="credit_card" id="credit_card" />
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Cartão de Crédito</p>
                      <p className="text-sm text-muted-foreground">
                        Parcelamento em até 12x sem juros
                      </p>
                    </div>
                  </label>
                  
                  {/* Pix Option */}
                  <label 
                    htmlFor="pix"
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      paymentMethod === "pix" 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <RadioGroupItem value="pix" id="pix" />
                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-success" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Pix</p>
                      <p className="text-sm text-muted-foreground">
                        Pagamento instantâneo com desconto
                      </p>
                    </div>
                    <span className="text-xs font-medium text-success bg-success/10 px-2 py-1 rounded-full">
                      5% OFF
                    </span>
                  </label>
                </RadioGroup>

                {/* Credit Card Form (shown when selected) */}
                {paymentMethod === "credit_card" && (
                  <div className="mt-6 pt-6 border-t border-border space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">Número do cartão</Label>
                      <Input
                        id="cardNumber"
                        placeholder="0000 0000 0000 0000"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cardExpiry">Validade</Label>
                        <Input
                          id="cardExpiry"
                          placeholder="MM/AA"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cardCvv">CVV</Label>
                        <Input
                          id="cardCvv"
                          placeholder="000"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="cardName">Nome no cartão</Label>
                      <Input
                        id="cardName"
                        placeholder="Como está impresso no cartão"
                      />
                    </div>
                  </div>
                )}

                {/* Pix Info (shown when selected) */}
                {paymentMethod === "pix" && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <QrCode className="w-16 h-16 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        O QR Code será gerado após confirmar a assinatura
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Order Summary */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Plano selecionado</p>
                <p className="font-medium">{currentPlan.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total mensal</p>
                <p className="text-xl font-bold text-primary">R$ {currentPlan.price}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Continue Button */}
        <Button 
          className="w-full" 
          size="lg"
          onClick={handleContinue}
        >
          {step === 3 ? "Finalizar assinatura" : "Continuar"}
        </Button>
        
        <p className="text-xs text-muted-foreground text-center">
          Ao continuar, você concorda com os{" "}
          <a href="#" className="text-primary hover:underline">Termos de Uso</a>
          {" "}e{" "}
          <a href="#" className="text-primary hover:underline">Política de Privacidade</a>
        </p>
      </div>
    </MainLayout>
  );
}
