import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/layouts/DashboardLayout';
import { useAuthStore } from '../stores/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import ProvidersTable from '../components/admin/ProvidersTable';
import AssignedQuestionnairesTable from '../components/admin/AssignedQuestionnairesTable'; // <-- NOUVEL IMPORT
import { supabase } from '../integrations/supabase/client';
import LoadingScreen from '../components/LoadingScreen'; // Optionnel: pour afficher pendant la redirection

const Dashboard = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const userRole = user?.user_metadata?.role;

  useEffect(() => {
    // Supprimez ou commentez la ligne suivante :
    // if (user) {
    //   supabase.auth.refreshSession();
    // }

    // Redirection pour le rôle 'provider'
    if (userRole === 'provider') {
      navigate('/provider/profile', { replace: true });
    }
  }, [userRole, navigate]); // Mettez à jour les dépendances. 'user' n'est plus nécessaire ici si sa seule utilité était pour refreshSession.

  // Si l'utilisateur est un provider, ne rien rendre ou afficher un écran de chargement
  // pendant que la redirection s'effectue.
  if (userRole === 'provider') {
    return <LoadingScreen />; // Ou simplement null
  }

  const isSuperAdmin = userRole === 'superAdmin';
  
  return (
    <DashboardLayout title="Dashboard">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>
                {isSuperAdmin ? 'Super Admin Dashboard' : 'Admin Dashboard'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {isSuperAdmin 
                  ? 'You have full access to manage admins and providers' 
                  : 'You have access to manage providers'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                {isSuperAdmin ? 'Manage admins and providers' : 'Manage providers'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  From here you can invite and manage users in the system.
                </p>
                
                {isSuperAdmin && (
                  <div className="flex flex-col space-y-2">
                    <button 
                      onClick={() => navigate('/admin/manage-admins')}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage Administrators
                    </button>
                    <button 
                      onClick={() => navigate('/admin/manage-providers')}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage Providers
                    </button>
                  </div>
                )}
                {/* Un admin simple pourrait voir un lien vers Manage Providers ici s'il n'est pas superAdmin */}
                {!isSuperAdmin && userRole === 'admin' && (
                   <div className="flex flex-col space-y-2">
                     <button 
                      onClick={() => navigate('/admin/manage-providers')} // Assurez-vous que cette route est accessible aux admins
                      className="text-sm text-primary hover:underline"
                    >
                      Manage Providers
                    </button>
                   </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Your account information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="text-sm font-medium">Email: </span>
                  <span className="text-sm text-muted-foreground">{user?.email}</span>
                </div>
                <div>
                  <span className="text-sm font-medium">Role: </span>
                  <span className="text-sm text-muted-foreground capitalize">{userRole}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* La table des Providers ne devrait être visible que par admin/superAdmin */}
        {(userRole === 'admin' || userRole === 'superAdmin') && (
          <>
            <ProvidersTable />
            <div className="mt-8"> {/* Ajoute un peu d'espace */}
              <AssignedQuestionnairesTable />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
