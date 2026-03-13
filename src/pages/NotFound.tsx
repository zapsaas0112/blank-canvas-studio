import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
          <MessageSquare className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-6">Página não encontrada</p>
        <Button asChild><Link to="/">Voltar ao início</Link></Button>
      </div>
    </div>
  );
}
