import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Bot, GripVertical, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface BotStep {
  id: string;
  keywords: string;
  response: string;
  action: 'continue' | 'transfer';
}

export default function BotConfig() {
  const [isActive, setIsActive] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('Olá! 👋 Bem-vindo ao nosso atendimento. Como podemos ajudar?');
  const [steps, setSteps] = useState<BotStep[]>([
    { id: '1', keywords: '1, vendas, comprar', response: 'Vou te conectar com nosso time de vendas! 🛍️', action: 'transfer' },
    { id: '2', keywords: '2, suporte, ajuda', response: 'Nosso suporte vai te atender em instantes! 🔧', action: 'transfer' },
    { id: '3', keywords: '', response: 'Desculpe, não entendi. Por favor, escolha uma opção:\n1 - Vendas\n2 - Suporte', action: 'continue' },
  ]);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => { fetchConfig(); }, []);

  async function fetchConfig() {
    const { data } = await supabase.from('bot_configs').select('*').limit(1).maybeSingle();
    if (data) {
      setConfigId(data.id);
      setIsActive(data.is_active);
      setWelcomeMessage(data.welcome_message || '');
      if (Array.isArray(data.steps) && data.steps.length > 0) {
        setSteps(data.steps as unknown as BotStep[]);
      }
    }
  }

  async function handleSave() {
    const payload = { is_active: isActive, welcome_message: welcomeMessage, steps: steps as any };
    if (configId) {
      await supabase.from('bot_configs').update(payload).eq('id', configId);
    } else {
      const { data } = await supabase.from('bot_configs').insert(payload).select().single();
      if (data) setConfigId(data.id);
    }
    toast.success('Bot salvo com sucesso!');
  }

  function addStep() {
    setSteps(prev => [...prev, { id: crypto.randomUUID(), keywords: '', response: '', action: 'continue' }]);
  }

  function removeStep(id: string) {
    setSteps(prev => prev.filter(s => s.id !== id));
  }

  function updateStep(id: string, field: keyof BotStep, value: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bot de Pré-Atendimento</h1>
            <p className="text-sm text-muted-foreground">Configure respostas automáticas</p>
          </div>
          <Button size="sm" onClick={handleSave}>Salvar</Button>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Bot ativo</p>
                <p className="text-xs text-muted-foreground">Responde automaticamente novas conversas</p>
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground text-sm">Mensagem de boas-vindas</Label>
            <Textarea
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              className="bg-muted/50 border-border min-h-[80px]"
            />
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
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Passo {i + 1}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(step.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <div>
                <Label className="text-foreground text-xs">Palavras-chave (separadas por vírgula)</Label>
                <Input value={step.keywords} onChange={e => updateStep(step.id, 'keywords', e.target.value)} className="bg-muted/50 border-border mt-1 text-sm" placeholder="Ex: vendas, comprar, preço" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Deixe vazio para catch-all</p>
              </div>
              <div>
                <Label className="text-foreground text-xs">Resposta do bot</Label>
                <Textarea value={step.response} onChange={e => updateStep(step.id, 'response', e.target.value)} className="bg-muted/50 border-border mt-1 text-sm min-h-[60px]" />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground">Ação:</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStep(step.id, 'action', 'continue')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${step.action === 'continue' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Continuar bot
                  </button>
                  <button
                    onClick={() => updateStep(step.id, 'action', 'transfer')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${step.action === 'transfer' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    <ArrowRight className="w-3 h-3 inline mr-1" /> Transferir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
