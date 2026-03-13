import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Hash } from 'lucide-react';
import { toast } from 'sonner';

const PRESET_COLORS = ['#25D366', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#10B981'];

export default function Tags() {
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  useEffect(() => { load(); }, []);
  async function load() { const { data } = await supabase.from('tags').select('*').order('created_at'); if (data) setTags(data); }

  function openNew() { setEditId(null); setName(''); setColor(PRESET_COLORS[0]); setDialogOpen(true); }
  function openEdit(t: any) { setEditId(t.id); setName(t.name); setColor(t.color); setDialogOpen(true); }

  async function handleSave() {
    if (!name.trim()) { toast.error('Digite um nome'); return; }
    if (editId) { await supabase.from('tags').update({ name: name.trim(), color }).eq('id', editId); toast.success('Atualizada'); }
    else { await supabase.from('tags').insert({ name: name.trim(), color }); toast.success('Criada'); }
    setDialogOpen(false); load();
  }

  async function handleDelete(id: string) { await supabase.from('tags').delete().eq('id', id); toast.success('Removida'); load(); }

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Tags</h1><p className="text-sm text-muted-foreground">Organize suas conversas</p></div>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova tag</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {tags.map(t => (
            <div key={t.id} className="glass-card-hover p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} /><span className="text-sm font-medium text-foreground">{t.name}</span></div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
          {tags.length === 0 && <div className="glass-card p-8 text-center col-span-full"><Hash className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma tag</p></div>}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">{editId ? 'Editar' : 'Nova'} tag</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-foreground text-sm">Nome</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
              <div><Label className="text-foreground text-sm">Cor</Label><div className="flex gap-2 mt-2">{PRESET_COLORS.map(c => (<button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />))}</div></div>
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
