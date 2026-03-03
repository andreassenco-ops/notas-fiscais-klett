import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Loader2, Eye, EyeOff, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePatientAuth } from "@/contexts/PatientAuthContext";
import klettLogo from "@/assets/klett-logo.png";

export default function PatientLogin() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = usePatientAuth();
  
  const [cpfInput, setCpfInput] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate("/paciente", { replace: true });
    return null;
  }

  const formatCpfInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCpf = cpfInput.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setError("Digite um CPF válido com 11 dígitos");
      return;
    }

    if (!password.trim()) {
      setError("Digite sua senha");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(cleanCpf, password);
      
      if (result.success) {
        navigate("/paciente", { replace: true });
      } else {
        setError(result.error || "Erro ao fazer login");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex flex-col">
      {/* Top accent bar */}
      <div className="h-1.5 bg-primary" />


      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <img 
                src={klettLogo} 
                alt="Klett - Laboratório de Análises Clínicas" 
                className="h-14 w-auto"
              />
            </div>
            <div>
              <CardTitle className="text-2xl">Acesse seus resultados</CardTitle>
              <CardDescription className="mt-2">
                Entre com seu CPF e senha para visualizar seus exames
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* CPF Input */}
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={cpfInput}
                  onChange={(e) => setCpfInput(formatCpfInput(e.target.value))}
                  maxLength={14}
                  inputMode="numeric"
                  className="text-lg"
                  autoComplete="username"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <HelpCircle className="h-3.5 w-3.5 mr-1" />
                        Qual é minha senha?
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="space-y-2">
                        <h4 className="font-medium">Como descobrir sua senha</h4>
                        <p className="text-sm text-muted-foreground">
                          Sua senha é calculada a partir da sua data de nascimento:
                        </p>
                        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                          <li>Pegue sua data de nascimento no formato DDMMAAAA</li>
                          <li>Exemplo: 09/04/1986 → 09041986</li>
                          <li>Multiplique por 9</li>
                          <li>09041986 × 9 = <strong>81377874</strong></li>
                        </ol>
                        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                          Dica: Use uma calculadora se precisar!
                        </p>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="text-lg pr-10"
                    inputMode="numeric"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">
                      {showPassword ? "Ocultar senha" : "Mostrar senha"}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={isLoading || cpfInput.replace(/\D/g, "").length !== 11}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Entrar
                  </>
                )}
              </Button>
            </form>

            {/* Footer info */}
            <div className="mt-6 pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground">
                Primeiro acesso? Sua senha é sua data de nascimento × 9.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Em caso de dúvidas, entre em contato conosco.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-3 px-4 text-center text-sm">
        <p className="font-medium">Klett, Nossa história é cuidar de você</p>
      </footer>
    </div>
  );
}
