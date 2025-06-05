import React, { ReactNode, useEffect } from 'react'; // Add useEffect
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCog,
  HelpCircle,
  UserCircle,
  LogOut,
  ShieldCheck,
  ListChecks,
  ChevronDown,
  Menu,
  X,
  FileText,
  Bell,
  CheckSquare,
  Edit,
  FileQuestion,
  MessageSquareWarning,
  Settings, // Ajouter cette ligne pour importer l'icône Settings
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Import useQueryClient
import { supabase } from '@/integrations/supabase/client';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button'; // Assurez-vous que Button est importé
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Assurez-vous que DropdownMenu est importé
import { useAuthStore } from '@/stores/authStore'; // <-- AJOUTER CET IMPORT
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from 'sonner';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  roles: Array<'superAdmin' | 'admin' | 'provider'>;
}

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
}

const fetchUnreadNotificationsCount = async (userId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'unread');

  if (error) {
    console.error('Error fetching unread notifications count:', error);
    return 0;
  }
  return count || 0;
};

const DashboardLayout = ({ children, title }: DashboardLayoutProps) => {
  const { user, logout, loading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const queryClient = useQueryClient(); // Initialize queryClient

  const { data: unreadCount } = useQuery<number, Error, number, readonly (string | undefined)[]>({
    queryKey: ['unreadNotificationsCount', user?.id],
    queryFn: () => fetchUnreadNotificationsCount(user!.id),
    enabled: !!user?.id,
    // refetchInterval: 60000, // Polling can be a fallback or complement to real-time
  });

  useEffect(() => {
    if (!user?.id) return;

    // Listen to new rows in the notifications table for the current user
    const notificationsChannel = supabase
      .channel(`public:notifications:user_id=eq.${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('Real-time notification change received!', payload);
          // Invalidate the count query to refetch and update the badge
          queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount', user.id] });
          // Optionally, also invalidate the full notifications list if the user is on the notifications page
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] }); 

          // Show a toast for new notifications if it's an INSERT and status is unread
          if (payload.eventType === 'INSERT' && payload.new?.status === 'unread') {
            toast.info(`New notification: ${payload.new?.title || 'You have a new message.'}`, {
              description: payload.new?.body,
              action: {
                label: 'View',
                onClick: () => navigate('/notifications'),
              },
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to notifications channel for user:', user.id);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Notifications channel error or timeout:', err);
          // You might want to implement a retry mechanism or fallback to polling
        }
      });

    // Cleanup subscription on component unmount
    return () => {
      if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel);
        console.log('Unsubscribed from notifications channel for user:', user.id);
      }
    };
  }, [user?.id, queryClient, navigate]); // Add dependencies

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const userRole = user?.user_metadata?.role as 'superAdmin' | 'admin' | 'provider' | undefined;

  const navItems: NavItem[] = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'superAdmin', 'provider'] },
    { href: '/admin/manage-providers', icon: Users, label: 'Manage Providers', roles: ['superAdmin', 'admin'] }, // Modifié pour admin aussi
    { href: '/admin/manage-admins', icon: UserCog, label: 'Manage Admins', roles: ['superAdmin'] },
    { href: '/admin/manage-questions', icon: HelpCircle, label: 'Manage Questions', roles: ['admin', 'superAdmin'] },
    {
      href: '/admin/submissions-to-review', // NOUVEAU LIEN
      icon: Edit, // Ou CheckSquare, ou une autre icône pertinente
      label: 'Review Submissions',
      roles: ['admin', 'superAdmin'],
    },
    {
      href: '/admin/manage-questionnaires',
      icon: FileQuestion, // Ou ListChecks
      label: 'Manage Questionnaires',
      roles: ['admin', 'superAdmin'],
    },
    { href: '/provider/profile', icon: UserCircle, label: 'My Profile', roles: ['provider'] },
    { href: '/provider/my-questionnaires', icon: FileText, label: 'My Questionnaires', roles: ['provider'] },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (!userRole) return false;
    return item.roles.includes(userRole);
  });

  const renderNavLinks = (isMobile = false) => (
    filteredNavItems.map((item) => (
      <Link
        key={item.label}
        to={item.href}
        onClick={isMobile ? () => setIsMobileMenuOpen(false) : undefined}
        className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors
          ${location.pathname === item.href
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
      >
        <item.icon className="mr-3 h-5 w-5" />
        {item.label}
      </Link>
    ))
  );


  if (loading) {
    // Ceci est un exemple simple, vous pourriez vouloir un écran de chargement plus élaboré
    return <div className="flex h-screen items-center justify-center">Loading application...</div>;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex md:flex-col md:w-64 border-r">
        <div className="flex items-center h-16 px-4 border-b">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <span className="text-xl font-semibold">RiskFiel</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {renderNavLinks()}
        </nav>
      </aside>

      {/* Mobile menu */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b bg-card">
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 flex flex-col bg-card text-card-foreground">
                 <div className="flex items-center h-16 px-6 border-b">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                    <span className="ml-3 text-lg font-semibold">Admin Panel</span> {/* Ou RiskFiel */}
                  </div>
                  <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {renderNavLinks(true)}
                  </nav>
                  <div className="p-4 border-t">
                    <Button variant="outline" className="w-full" onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}>
                      <LogOut className="mr-2 h-4 w-4" /> Logout
                    </Button>
                  </div>
              </SheetContent>
            </Sheet>
          </div>
          <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
          <div className="flex items-center space-x-3">
            {/* Icône de Notifications */}
            {user && (
              <Button
                variant="ghost"
                size="icon" // Utilise la taille standard pour les boutons d'icône
                className="relative rounded-full"
                onClick={() => navigate('/notifications')}
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount !== undefined && unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            )}
            {/* Icône de Profil Utilisateur avec DropdownMenu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  {/* Ajustement de la taille du bouton et de l'icône */}
                  <Button
                    variant="ghost"
                    size="icon" // Utilise la taille standard pour les boutons d'icône
                    className="relative rounded-full"
                  >
                    <UserCircle className="h-5 w-5 text-muted-foreground" /> {/* Taille de l'icône ajustée */}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.email}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        Role: {user.user_metadata?.role || 'N/A'}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/* Vous pouvez décommenter ces lignes si nécessaire */}
                  {/* <DropdownMenuItem onClick={() => navigate('/provider/profile')}>Profile</DropdownMenuItem> */}
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="mr-2 h-4 w-4" /> {/* Ajouter cette ligne */}
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator /> 
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
