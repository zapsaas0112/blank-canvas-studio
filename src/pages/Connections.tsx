import AppLayout from '@/components/AppLayout';
import WhatsAppManager from '@/components/WhatsAppManager';
import { useAuth } from '@/contexts/AuthContext';

export default function Connections() {
  const { profile } = useAuth();

  return (
    <AppLayout>
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Conexões WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Gerencie sua conexão com o WhatsApp</p>
        </div>

        <WhatsAppManager userName={profile?.name || "Usuário"} />
      </div>
    </AppLayout>
  );
}
