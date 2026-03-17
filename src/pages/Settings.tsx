import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { User, Lock, Palette } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(profile?.name || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleUpdateProfile() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ name: name.trim() }).eq('id', profile?.id || '');
    if (error) toast.error('Erro ao salvar'); else toast.success('Perfil atualizado');
    setSaving(false);
  }

  async function handleUpdatePassword() {
    if (password.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message); else { toast.success('Senha atualizada'); setPassword(''); }
    setSaving(false);
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-foreground">Configurações</h1><p className="text-sm text-muted-foreground">Gerencie seu perfil e preferências</p></div>

        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
            <h2 className="text-sm font-semibold text-foreground">Perfil</h2>
          </div>
          <div><Label className="text-foreground text-sm">Nome</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
          <div><Label className="text-foreground text-sm">Email</Label><Input value={profile?.email || ''} disabled className="bg-muted/30 border-border mt-1 text-muted-foreground" /></div>
          <Button onClick={handleUpdateProfile} disabled={saving} size="sm">Salvar perfil</Button>
        </div>

        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center"><Lock className="w-5 h-5 text-secondary" /></div>
            <h2 className="text-sm font-semibold text-foreground">Alterar senha</h2>
          </div>
          <div><Label className="text-foreground text-sm">Nova senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-muted/50 border-border mt-1" placeholder="Mínimo 6 caracteres" /></div>
          <Button onClick={handleUpdatePassword} disabled={saving} size="sm" variant="outline">Atualizar senha</Button>
        </div>

        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center"><Palette className="w-5 h-5 text-info" /></div>
            <h2 className="text-sm font-semibold text-foreground">Aparência</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Modo escuro</p>
              <p className="text-xs text-muted-foreground">Altere entre tema claro e escuro</p>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
