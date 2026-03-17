import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, initialized, hasWorkspace } = useAuth();

  // Still initializing — show spinner (will resolve quickly)
  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) return <Navigate to="/login" replace />;

  // Authenticated but no workspace
  if (!hasWorkspace) return <Navigate to="/onboarding" replace />;

  // Fully authenticated with workspace
  return <>{children}</>;
}
