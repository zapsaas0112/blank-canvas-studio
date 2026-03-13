import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, Upload, Pencil, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';

interface Contact { id: string; name: string; phone: string; metadata: any; created_at: string; }

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [importData, setImportData] = useState<{ name: string; phone: string }[]>([]);

  useEffect(() => { fetchContacts(); }, []);

  async function fetchContacts() {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (data) setContacts(data);
  }

  async function handleSave() {
    if (!name.trim() || !phone.trim()) { toast.error('Preencha nome e telefone'); return; }
    if (editId) {
      await supabase.from('customers').update({ name: name.trim(), phone: phone.trim() }).eq('id', editId);
      toast.success('Contato atualizado');
    } else {
      await supabase.from('customers').insert({ name: name.trim(), phone: phone.trim() });
      toast.success('Contato adicionado');
    }
    setDialogOpen(false); setEditId(null); setName(''); setPhone(''); fetchContacts();
  }

  function startEdit(c: Contact) { setEditId(c.id); setName(c.name); setPhone(c.phone); setDialogOpen(true); }
  function openNew() { setEditId(null); setName(''); setPhone(''); setDialogOpen(true); }

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const parsed = rows.map(r => ({
        name: r.name || r.Name || r.nome || r.Nome || '',
        phone: String(r.phone || r.Phone || r.telefone || r.Telefone || r.numero || ''),
      })).filter(r => r.phone);
      setImportData(parsed);
    };
    reader.readAsBinaryString(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] },
  });

  async function handleImport() {
    if (importData.length === 0) return;
    const { error } = await supabase.from('customers').insert(importData.map(d => ({ name: d.name, phone: d.phone })));
    if (error) { toast.error('Erro ao importar'); return; }
    toast.success(`${importData.length} contatos importados!`);
    setImportData([]); setImportOpen(false); fetchContacts();
  }

  const filtered = contacts.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><h1 className="text-xl font-bold text-foreground">Contatos</h1><p className="text-sm text-muted-foreground">{contacts.length} contatos</p></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4 mr-1" /> Importar</Button>
            <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
          </div>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-muted/50 border-border h-9 text-sm" />
        </div>
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader><TableRow className="border-border"><TableHead className="text-muted-foreground">Nome</TableHead><TableHead className="text-muted-foreground">Telefone</TableHead><TableHead className="text-muted-foreground hidden md:table-cell">Criado em</TableHead><TableHead className="text-muted-foreground w-20">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id} className="border-border/50">
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{format(new Date(c.created_at), 'dd/MM/yy')}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum contato</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">{editId ? 'Editar' : 'Novo'} contato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-foreground text-sm">Nome</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
              <div><Label className="text-foreground text-sm">Telefone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="bg-muted/50 border-border mt-1" placeholder="+55..." /></div>
              <Button onClick={handleSave} className="w-full">{editId ? 'Salvar' : 'Adicionar'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader><DialogTitle className="text-foreground">Importar contatos</DialogTitle></DialogHeader>
            {importData.length === 0 ? (
              <div {...getRootProps()} className={cn('border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors', isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
                <input {...getInputProps()} />
                <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Arraste .xlsx ou .csv</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-foreground font-medium">{importData.length} contatos encontrados</p>
                <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                  <Table>
                    <TableHeader><TableRow className="border-border"><TableHead className="text-muted-foreground">Nome</TableHead><TableHead className="text-muted-foreground">Telefone</TableHead></TableRow></TableHeader>
                    <TableBody>{importData.slice(0, 20).map((r, i) => (<TableRow key={i} className="border-border/50"><TableCell className="text-foreground text-sm">{r.name}</TableCell><TableCell className="text-muted-foreground text-sm">{r.phone}</TableCell></TableRow>))}</TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setImportData([])}>Cancelar</Button>
                  <Button className="flex-1" onClick={handleImport}>Importar {importData.length}</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
