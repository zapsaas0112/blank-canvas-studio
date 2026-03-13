import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface QuickReply { id: string; title: string; content: string; shortcut: string | null; created_by: string | null; }

export default function QuickReplies() {
  const { user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shortcut, setShortcut] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { const { data } = await supabase.from('quick_replies').select('*').order('created_at', { ascending: false }); if (data) setReplies(data); }

  function openNew() { setEditId(null); setTitle(''); setContent(''); setShortcut(''); setDialogOpen(true); }
  function openEdit(r: QuickReply) { setEditId(r.id); setTitle(r.title); setContent(r.content); setShortcut(r.shortcut || ''); setDialogOpen(true); }

  async function handleSave() {
    if (!title.trim() || !content.trim()) { toast.error('Preencha título e conteúdo'); return; }
    const payload = { title: title.trim(), content: content.trim(), shortcut: shortcut.trim() || null, created_by: user?.id || null };
    if (editId) { await supabase.from('quick_replies').update(payload).eq('id', editId); toast.success('Atualizado'); }
    else { await supabase.from('quick_replies').insert(payload); toast.success('Criado'); }
    setDialogOpen(false); load();
  }

  async function handleDelete(id: string) { await supabase.from('quick_replies').delete().eq('id', id); toast.success('Removido'); load(); }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Respostas Rápidas</h1><p className="text-sm text-muted-foreground">Atalhos para mensagens frequentes</p></div>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {replies.map(r => (
            <div key={r.id} className="glass-card-hover p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /><h3 className="text-sm font-medium text-foreground">{r.title}</h3></div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{r.content}</p>
              {r.shortcut && <p className="text-[10px] text-primary mt-2 font-mono">/{r.shortcut}</p>}
            </div>
          ))}
          {replies.length === 0 && <div className="glass-card p-8 text-center col-span-full"><Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma resposta rápida</p></div>}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">{editId ? 'Editar' : 'Nova'} resposta rápida</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-foreground text-sm">Título</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
              <div><Label className="text-foreground text-sm">Conteúdo</Label><Textarea value={content} onChange={e => setContent(e.target.value)} className="bg-muted/50 border-border mt-1 min-h-[80px]" /></div>
              <div><Label className="text-foreground text-sm">Atalho</Label><Input value={shortcut} onChange={e => setShortcut(e.target.value)} className="bg-muted/50 border-border mt-1" placeholder="Ex: saudacao" /></div>
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
