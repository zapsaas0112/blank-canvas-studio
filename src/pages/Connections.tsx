import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import WhatsAppManager from '@/components/WhatsAppManager';

export default function Connections() {
  const { profile } = useAuth();

  return (
    <AppLayout>
      <div className="p-6 max-w-lg mx-auto">
        <WhatsAppManager userName={profile?.name || "Usuário"} />
      </div>
    </AppLayout>
  );
}
