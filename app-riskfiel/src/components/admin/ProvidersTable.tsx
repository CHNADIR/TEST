import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { UserPlus, Loader2, MoreHorizontal, Edit, Trash2, MailWarning, RotateCcw } from 'lucide-react'; // AJOUTER MoreHorizontal, Edit, Trash2, MailWarning, RotateCcw
import UserInviteModal from './UserInviteModal';
import UserEditModal from './UserEditModal'; // AJOUTER CET IMPORT
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // AJOUTER CET IMPORT
import { useToast } from '@/hooks/use-toast'; // AJOUTER CET IMPORT
import { useMutation, useQueryClient } from '@tanstack/react-query'; // AJOUTER CET IMPORT
import { Badge } from '../ui/badge';
import { useAuthStore } from '@/stores/authStore'; // Assurez-vous que le chemin est correct

// Type pour les données retournées par la fonction RPC (avant traitement)
type RpcUserResponse = Database["public"]["Functions"]["get_users_by_role"]["Returns"][number];

export type ProviderDisplayInfo = { // Type pour l'affichage dans le tableau
  id: string;
  email: string; // Non-null pour l'affichage, avec un fallback
  created_at: string;
  status: 'Active' | 'Invited';
};

const fetchProviders = async (): Promise<ProviderDisplayInfo[]> => {
  const { data: rpcData, error } = await supabase
    .rpc('get_users_by_role', { p_role: 'provider' });

  if (error) {
    console.error('Error fetching providers:', error);
    throw error;
  }

  if (!rpcData) {
    return [];
  }

  return rpcData.map((user: RpcUserResponse) => {
    let passwordSet = false;
    if (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata !== null) {
      const metadata = user.user_metadata as { password_set?: unknown };
      if (typeof metadata.password_set === 'boolean') {
        passwordSet = metadata.password_set;
      }
    }
    return {
      id: user.id,
      email: user.email ?? 'N/A',
      created_at: user.created_at,
      status: passwordSet ? 'Active' : 'Invited',
    };
  });
};

const ProvidersTable = () => {
  const [editingProvider, setEditingProvider] = useState<ProviderDisplayInfo | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const { toast } = useToast(); 
  const queryClient = useQueryClient(); 

  // Récupérer le rôle de l'utilisateur actuel
  const { userAppRole, userId } = useAuthStore(state => ({ 
    userAppRole: state.userAppRole, 
    userId: state.userId 
  }));

  const { data: providers, isLoading, error } = useQuery<ProviderDisplayInfo[], Error>({
    queryKey: ['providers'],
    queryFn: fetchProviders,
  });

  // Fonction pour "supprimer" un fournisseur (révoquer l'accès/rôle)
  // Ceci est un PLACEHOLDER. Implémentez une fonction Supabase sécurisée (RPC ou Edge Function).
  const revokeProviderAccess = async (providerId: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc('revoke_user_app_role', {
      p_user_id_to_revoke: providerId,
      p_role_being_revoked: 'provider'
    });
    if (rpcError) {
      console.error('RPC Error revoke_user_app_role (provider):', rpcError);
      throw rpcError;
    }
  };

  const deleteProviderMutation = useMutation({
    mutationFn: revokeProviderAccess,
    onSuccess: (_, providerId) => {
      toast({ title: "Success", description: `Provider access revoked for ID: ${providerId}.` });
      queryClient.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (err: Error, providerId) => {
      toast({ 
        title: "Error", 
        description: `Failed to revoke provider access for ID ${providerId}: ${err.message}`, 
        variant: "destructive" 
      });
    },
  });

  const handleEditProvider = (provider: ProviderDisplayInfo) => {
    // Admins et SuperAdmins peuvent éditer les fournisseurs
    if (userAppRole === 'admin' || userAppRole === 'superAdmin') {
      setEditingProvider(provider);
      setEditModalOpen(true);
    } else {
      toast({ title: "Permission Denied", description: "You do not have permission to edit providers.", variant: "destructive" });
    }
  };

  const handleDeleteProvider = (provider: ProviderDisplayInfo) => { // Modifié pour prendre ProviderDisplayInfo
    // Admins et SuperAdmins peuvent révoquer l'accès des fournisseurs
    // La RPC vérifiera aussi les permissions.
    // On vérifie ici pour donner un feedback UI immédiat et éviter un appel inutile.
    if (userAppRole === 'admin' || userAppRole === 'superAdmin') {
      if (window.confirm(`Are you sure you want to revoke access for provider ${provider.email}? Their account will remain, but they will lose provider privileges.`)) {
        deleteProviderMutation.mutate(provider.id);
      }
    } else {
       toast({ title: "Permission Denied", description: "You do not have permission to revoke provider access.", variant: "destructive" });
    }
  };

  const handleResendProviderInvite = async (providerEmail: string) => {
    if (userAppRole === 'admin' || userAppRole === 'superAdmin') {
      toast({ title: "Action: Resend Invite", description: `TODO: Implement resend invite for ${providerEmail}` });
      // Implémentez la logique de renvoi d'invitation ici
      // try {
      //   const { error: resendError } = await supabase.auth.resend({ type: 'invite', email: providerEmail });
      //   if (resendError) throw resendError;
      //   toast({ title: "Success", description: `Invitation resent to ${providerEmail}` });
      // } catch (err: any) {
      //   toast({ title: "Error", description: `Failed to resend invitation: ${err.message}`, variant: "destructive" });
      // }
    } else {
      toast({ title: "Permission Denied", description: "You do not have permission to resend provider invitations.", variant: "destructive" });
    }
  };
  
  if (error) {
    return <div className="text-center text-destructive">Failed to load providers: {error.message}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Providers</h2>
        {/* Admins et SuperAdmins peuvent inviter des fournisseurs */}
        {(userAppRole === 'admin' || userAppRole === 'superAdmin') && (
          <Button onClick={() => setInviteModalOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Provider
          </Button>
        )}
      </div>

      <Table>
        <TableCaption>List of all providers in the system</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></TableCell></TableRow>
          ) : providers && providers.length > 0 ? (
            providers.map((provider) => (
              <TableRow key={provider.id}>
                <TableCell>{provider.email}</TableCell>
                <TableCell>
                  <Badge variant={provider.status === 'Active' ? 'default' : 'secondary'}>
                    {provider.status}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(provider.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {/* Les actions sont disponibles pour admin et superAdmin */}
                  {(userAppRole === 'admin' || userAppRole === 'superAdmin') ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={deleteProviderMutation.isPending && deleteProviderMutation.variables === provider.id}>
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditProvider(provider)}>
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        {provider.status === 'Invited' && (
                          <DropdownMenuItem onClick={() => handleResendProviderInvite(provider.email)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            <span>Resend Invite</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {/* Un admin ne peut pas se révoquer lui-même s'il est aussi provider, la RPC devrait gérer ça */}
                        {/* Mais la principale protection est que currentUserId ne correspondra pas à provider.id si l'admin n'est pas aussi le provider listé */}
                        {/* Et un admin ne peut pas révoquer un autre admin via cette table. */}
                        <DropdownMenuItem
                          onClick={() => handleDeleteProvider(provider)} // Passez l'objet provider entier
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          disabled={deleteProviderMutation.isPending && deleteProviderMutation.variables === provider.id}
                        >
                          {deleteProviderMutation.isPending && deleteProviderMutation.variables === provider.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          <span>Revoke Access</span> {/* Changé de "Delete" à "Revoke Access" pour plus de clarté */}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span>No actions available</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
             <TableRow><TableCell colSpan={4} className="text-center py-8">No providers found.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {/* Modales - Conditionner leur ouverture/utilisation en fonction du rôle si nécessaire */}
      {(userAppRole === 'admin' || userAppRole === 'superAdmin') && inviteModalOpen && (
        <UserInviteModal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          role="provider"
          title="Invite Provider"
        />
      )}

      {(userAppRole === 'admin' || userAppRole === 'superAdmin') && editModalOpen && editingProvider && (
        <UserEditModal 
          isOpen={editModalOpen} 
          onClose={() => {
            setEditModalOpen(false);
            setEditingProvider(null);
          }} 
          userToEdit={editingProvider} // C'est un ProviderDisplayInfo
          role="provider" // Le rôle de l'utilisateur en cours d'édition
          title={`Edit Provider: ${editingProvider.email}`}
          onSuccess={() => {
             queryClient.invalidateQueries({ queryKey: ['providers'] });
          }}
        />
      )}
    </div>
  );
};

export default ProvidersTable;
