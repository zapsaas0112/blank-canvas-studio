import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name },
      },
    });
    if (error) {
      toast.error(error.message);
    } else if (data.user?.identities?.length === 0) {
      toast.error('Este email já está cadastrado.');
    } else if (data.session) {
      toast.success('Conta criada com sucesso!');
      navigate('/');
    } else {
      toast.success('Conta criada! Verifique seu email para ativar.');
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
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Criar Conta</h1>
          <p className="text-sm text-muted-foreground mt-1">Comece a usar o ZapDesk</p>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground text-sm">Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="name" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} className="pl-10 bg-muted/50 border-border" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground text-sm">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 bg-muted/50 border-border" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground text-sm">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10 bg-muted/50 border-border" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full font-medium" disabled={loading}>
              {loading ? 'Criando...' : 'Criar conta'}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Já tem conta? <Link to="/login" className="text-primary hover:underline font-medium">Fazer login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
