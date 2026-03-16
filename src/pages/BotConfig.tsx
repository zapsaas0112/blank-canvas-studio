import { useState } from 'react';
import { useBotConfig } from '@/hooks/useBotConfig';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Bot, GripVertical, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BotStep } from '@/types/database';

export default function BotConfig() {
  const { config, loading, save } = useBotConfig();
  const [isActive, setIsActive] = useState(config?.is_active ?? false);
  const [welcomeMessage, setWelcomeMessage] = useState(config?.welcome_message || 'Olá! 👋 Bem-vindo ao nosso atendimento.');
  const [steps, setSteps] = useState<BotStep[]>(config?.steps || [
    { id: '1', keywords: '1, vendas, comprar', response: 'Vou te conectar com nosso time de vendas! 🛍️', action: 'transfer' },
    { id: '2', keywords: '2, suporte, ajuda', response: 'Nosso suporte vai te atender em instantes! 🔧', action: 'transfer' },
    { id: '3', keywords: '', response: 'Desculpe, não entendi. Escolha:\n1 - Vendas\n2 - Suporte', action: 'continue' },
  ]);
  const [initialized, setInitialized] = useState(false);

  // Sync state from config once loaded
  if (config && !initialized) {
    setIsActive(config.is_active);
    setWelcomeMessage(config.welcome_message || '');
    if (config.steps && config.steps.length > 0) setSteps(config.steps);
    setInitialized(true);
  }

  async function handleSave() {
    try { await save(isActive, welcomeMessage, steps); toast.success('Bot salvo!'); }
    catch { toast.error('Erro ao salvar'); }
  }

  function addStep() { setSteps(prev => [...prev, { id: crypto.randomUUID(), keywords: '', response: '', action: 'continue' }]); }
  function removeStep(id: string) { setSteps(prev => prev.filter(s => s.id !== id)); }
  function updateStep(id: string, field: keyof BotStep, value: string) { setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s)); }

  if (loading) return <AppLayout><div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Bot de Pré-Atendimento</h1><p className="text-sm text-muted-foreground">Configure respostas automáticas</p></div>
          <Button size="sm" onClick={handleSave}>Salvar</Button>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Bot className="w-5 h-5 text-primary" /></div>
              <div><p className="text-sm font-medium text-foreground">Bot ativo</p><p className="text-xs text-muted-foreground">Responde automaticamente novas conversas</p></div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground text-sm">Mensagem de boas-vindas</Label>
            <Textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} className="bg-muted/50 border-border min-h-[80px]" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Fluxo de respostas</h2>
            <Button variant="outline" size="sm" onClick={addStep}><Plus className="w-3.5 h-3.5 mr-1" /> Adicionar passo</Button>
          </div>
          {steps.map((step, i) => (
            <div key={step.id} className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><GripVertical className="w-4 h-4 text-muted-foreground" /><span className="text-xs font-medium text-muted-foreground">Passo {i + 1}</span></div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(step.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <div><Label className="text-foreground text-xs">Palavras-chave</Label><Input value={step.keywords} onChange={e => updateStep(step.id, 'keywords', e.target.value)} className="bg-muted/50 border-border mt-1 text-sm" placeholder="Ex: vendas, comprar" /><p className="text-[10px] text-muted-foreground mt-0.5">Vazio = catch-all</p></div>
              <div><Label className="text-foreground text-xs">Resposta</Label><Textarea value={step.response} onChange={e => updateStep(step.id, 'response', e.target.value)} className="bg-muted/50 border-border mt-1 text-sm min-h-[60px]" /></div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Ação:</Label>
                <div className="flex gap-2">
                  <button onClick={() => updateStep(step.id, 'action', 'continue')} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${step.action === 'continue' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>Continuar bot</button>
                  <button onClick={() => updateStep(step.id, 'action', 'transfer')} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${step.action === 'transfer' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><ArrowRight className="w-3 h-3 inline mr-1" />Transferir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
