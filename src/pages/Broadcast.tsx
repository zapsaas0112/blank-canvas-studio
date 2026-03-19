import { useState, useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useBroadcasts } from "@/hooks/useBroadcasts";
import { supabase } from "@/integrations/supabase/client";
import { interpolateTemplate } from "@/services/whatsappService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Send, Trash2, Plus, Eye, ArrowLeft } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

type ViewMode = "list" | "create" | "detail";

export default function Broadcast() {
  const { workspace } = useWorkspace();
  const { broadcasts, loading, createBroadcast, startBroadcast, deleteBroadcast, refetch } =
    useBroadcasts(workspace?.id ?? null);

  const [view, setView] = useState<ViewMode>("list");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("20");
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Load contacts
  useEffect(() => {
    if (!workspace?.id) return;
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("workspace_id", workspace.id)
      .order("name")
      .then(({ data }) => setContacts(data || []));
  }, [workspace?.id]);

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    const min = parseInt(delayMin) || 10;
    const max = parseInt(delayMax) || 20;

    if (!name.trim()) return toast.error("Nome da campanha é obrigatório");
    if (!message.trim()) return toast.error("Mensagem é obrigatória");
    if (selectedContactIds.length === 0) return toast.error("Selecione pelo menos um contato");
    if (min < 0 || max < 0) return toast.error("Delay não pode ser negativo");
    if (max < min) return toast.error("Delay máximo deve ser maior ou igual ao mínimo");

    setCreating(true);
    try {
      const broadcastId = await createBroadcast({
        name: name.trim(),
        message: message.trim(),
        contactIds: selectedContactIds,
        delayMin: min,
        delayMax: max,
      });

      toast.success("Campanha criada!");
      await startBroadcast(broadcastId);
      toast.success("Disparo iniciado!");
      refetch();
      setView("list");
      resetForm();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName("");
    setMessage("");
    setDelayMin("10");
    setDelayMax("20");
    setSelectedContactIds([]);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBroadcast(id);
      if (selectedBroadcastId === id) {
        setSelectedBroadcastId(null);
        setView("list");
      }
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    }
  };

  // Preview message with first selected contact
  const previewContact = contacts.find((c) => selectedContactIds.includes(c.id));
  const previewMessage = previewContact
    ? interpolateTemplate(message, { name: previewContact.name, phone: previewContact.phone })
    : message;

  const statusColor: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    processing: "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };

  const selectedBroadcast = broadcasts.find((b) => b.id === selectedBroadcastId);

  if (view === "create") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">Nova Campanha</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Nome da Campanha</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção Janeiro" />
          </div>

          <div>
            <Label>Mensagem (use {"{{nome}}"} para personalizar)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Olá {{nome}}, tudo bem?"
              rows={4}
            />
          </div>

          {message && previewContact && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm bg-primary/10 rounded-lg p-3">{previewMessage}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Delay mínimo (segundos)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={delayMin}
                onChange={(e) => setDelayMin(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => {
                  const v = parseInt(delayMin) || 0;
                  setDelayMin(String(Math.max(0, v)));
                }}
              />
            </div>
            <div>
              <Label>Delay máximo (segundos)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={delayMax}
                onChange={(e) => setDelayMax(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={() => {
                  const min = parseInt(delayMin) || 0;
                  const max = parseInt(delayMax) || 0;
                  setDelayMax(String(Math.max(min, max)));
                }}
              />
            </div>
          </div>

          <div>
            <Label>Contatos ({selectedContactIds.length} selecionados)</Label>
            <ScrollArea className="h-48 border rounded-md mt-1 p-2">
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
              ) : (
                contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedContactIds.includes(c.id)}
                      onCheckedChange={() => toggleContact(c.id)}
                    />
                    <span className="text-sm">{c.name || c.phone}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.phone}</span>
                  </label>
                ))
              )}
            </ScrollArea>
          </div>

          <Button onClick={handleCreate} disabled={creating} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            {creating ? "Criando e enviando..." : "Criar e Disparar"}
          </Button>
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedBroadcast) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">{selectedBroadcast.name}</h2>
          <Badge className={statusColor[selectedBroadcast.status] || ""}>{selectedBroadcast.status}</Badge>
        </div>
        <Card>
          <CardContent className="pt-4 space-y-3 text-sm">
            <div><strong>Mensagem:</strong> <p className="mt-1">{selectedBroadcast.message}</p></div>
            <div className="grid grid-cols-2 gap-2">
              <div><strong>Destinatários:</strong> {selectedBroadcast.total_recipients ?? 0}</div>
              <div><strong>Enviados:</strong> {selectedBroadcast.total_sent ?? 0}</div>
              <div><strong>Falhas:</strong> {selectedBroadcast.total_failed ?? 0}</div>
              <div><strong>Delay:</strong> {selectedBroadcast.delay_min_seconds}s - {selectedBroadcast.delay_max_seconds}s</div>
            </div>
            {selectedBroadcast.sent_at && (
              <div><strong>Enviado em:</strong> {new Date(selectedBroadcast.sent_at).toLocaleString("pt-BR")}</div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Campanhas</h2>
        <Button onClick={() => setView("create")}>
          <Plus className="h-4 w-4 mr-2" /> Nova Campanha
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : broadcasts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma campanha criada ainda
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {broadcasts.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:bg-accent/30 transition-colors">
              <CardContent className="py-3 flex items-center gap-4">
                <div
                  className="flex-1"
                  onClick={() => {
                    setSelectedBroadcastId(b.id);
                    setView("detail");
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{b.name}</p>
                    <Badge className={`text-xs ${statusColor[b.status] || ""}`}>{b.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{b.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.total_sent ?? 0}/{b.total_recipients ?? 0} enviados • Delay: {b.delay_min_seconds}s-{b.delay_max_seconds}s
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={b.status === "processing"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Todos os registros dessa campanha serão removidos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(b.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
