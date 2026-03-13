import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message);
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
      setIsResetMode(false);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4 glow-primary">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ZapDesk</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isResetMode ? 'Recuperar senha' : 'Acesse sua conta'}
          </p>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-muted/50 border-border"
                  required
                />
              </div>
            </div>

            {!isResetMode && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground text-sm">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-muted/50 border-border"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full font-medium" disabled={loading}>
              {loading ? 'Aguarde...' : isResetMode ? 'Enviar email' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={() => setIsResetMode(!isResetMode)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {isResetMode ? 'Voltar ao login' : 'Esqueceu a senha?'}
            </button>
            {!isResetMode && (
              <p className="text-xs text-muted-foreground">
                Não tem conta?{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Criar conta
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
