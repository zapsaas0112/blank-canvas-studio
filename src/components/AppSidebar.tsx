import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  MessageSquare,
  LayoutDashboard,
  Headphones,
  Settings,
  LogOut,
  Hash,
  Zap,
  Users,
  Wifi,
  Radio,
  Bot,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inbox', icon: Headphones, label: 'Atendimento' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/connections', icon: Wifi, label: 'Conexões' },
  { to: '/broadcast', icon: Radio, label: 'Disparos' },
  { to: '/bot', icon: Bot, label: 'Bot' },
  { to: '/quick-replies', icon: Zap, label: 'Respostas Rápidas' },
  { to: '/tags', icon: Hash, label: 'Tags' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export default function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 glow-primary">
            <MessageSquare className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">ZapDesk</h1>
              <p className="text-[10px] text-sidebar-muted capitalize">{role || 'agent'}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                          isActive
                            ? 'bg-sidebar-accent text-primary font-medium'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                        )
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-primary shrink-0">
              {profile?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{profile?.name || 'Usuário'}</p>
              <p className="text-[10px] text-sidebar-muted truncate">{profile?.email}</p>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sair"
              className="text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-destructive"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
