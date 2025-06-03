import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { UserPlus, Loader2, MoreHorizontal, Edit, Trash2, MailWarning, RotateCcw, UserMinus, ShieldAlert } from 'lucide-react';
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
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';
import { Badge } from '../ui/badge'; // Assurez-vous que Badge est importé
import { useAuthStore } from '@/stores/authStore'; // Assurez-vous que ce store existe et expose userAppRole et userId

// Type pour les données retournées par la fonction RPC (avant traitement)
type RpcUserResponse = Database["public"]["Functions"]["get_users_by_role"]["Returns"][number];

export type AdminDisplayInfo = { // Type pour l'affichage dans le tableau
  id: string;
  email: string; 
  created_at: string;
  status: 'Active' | 'Invited';
};

const fetchAdmins = async (): Promise<AdminDisplayInfo[]> => {
  const { data: rpcData, error } = await supabase
    .rpc('get_users_by_role', { p_role: 'admin' });

  if (error) {
    console.error('Error fetching admins:', error);
    throw error;
  }

  if (!rpcData) {
    return [];
  }

  return rpcData.map((user: RpcUserResponse) => {
    let passwordSet = false;
    if (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata !== null) {
      const metadata = user.user_metadata as { password_set?: unknown }; // Type assertion
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


const AdminsTable = () => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingAdmin, setEditingAdmin] = useState<AdminDisplayInfo | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { userAppRole, userId } = useAuthStore(state => ({ 
    userAppRole: state.userAppRole, 
    userId: state.userId 
  }));
  
  const { data: admins, isLoading, error } = useQuery<AdminDisplayInfo[], Error>({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  const revokeAdminAccess = async (adminId: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc('revoke_user_app_role', {
      p_user_id_to_revoke: adminId,
      p_role_being_revoked: 'admin'
    });
    if (rpcError) {
      console.error('RPC Error revoke_user_app_role (admin):', rpcError);
      throw rpcError;
    }
  };

  const revokeAdminRoleMutation = useMutation({
    mutationFn: revokeAdminAccess,
    onSuccess: (_, adminId) => {
      toast({ title: "Success", description: `Admin role revoked for user ID: ${adminId}.` });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err: Error, adminId) => {
      toast({ 
        title: "Error", 
        description: `Failed to revoke admin role for user ID ${adminId}: ${err.message}`, 
        variant: "destructive" 
      });
    },
  });

  const handleRevokeAdminRole = (admin: AdminDisplayInfo) => {
    if (window.confirm(`Are you sure you want to revoke admin role for ${admin.email} (ID: ${admin.id})?\nTheir account will remain, but they will lose admin privileges.`)) {
      revokeAdminRoleMutation.mutate(admin.id);
    }
  };

  const hardDeleteUserMutation = useMutation({
    mutationFn: async (userIdToDelete: string) => {
      const { data, error } = await supabase.functions.invoke('hard-delete-user', {
        body: { user_id_to_delete: userIdToDelete },
      });
      if (error) throw error; 
      if (data && data.error) throw new Error(data.error); 
      return data;
    },
    onSuccess: (data, userIdToDelete) => {
      toast({ title: "Success", description: `User ID: ${userIdToDelete} has been permanently deleted.` });
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err: Error, userIdToDelete) => {
      toast({
        title: "Error",
        description: `Failed to permanently delete user ID ${userIdToDelete}: ${err.message}`,
        variant: "destructive",
      });
    },
  });

  const handleHardDeleteUser = (admin: AdminDisplayInfo) => {
    if (window.confirm(`⚠️ EXTREMELY DESTRUCTIVE ACTION! ⚠️\n\nAre you sure you want to PERMANENTLY DELETE the user ${admin.email} (ID: ${admin.id}) from the system?\n\nThis will remove their authentication record and all associated data managed by Supabase Auth. This action CANNOT be undone.`)) {
      hardDeleteUserMutation.mutate(admin.id);
    }
  };
  
  const handleEditAdmin = (admin: AdminDisplayInfo) => {
    // Un admin ne peut pas éditer d'autres admins depuis cette table.
    // Un superAdmin peut éditer n'importe quel admin.
    // La modification de son propre profil par un admin se ferait via une page de profil dédiée.
    if (userAppRole === 'superAdmin') {
        setEditingAdmin(admin);
        setEditModalOpen(true);
    } else {
        toast({
            title: "Permission Denied",
            description: "You do not have permission to edit other administrators.",
            variant: "destructive"
        });
    }
  };
  
  const handleResendAdminInvite = async (adminEmail: string) => {
    // Seul un superAdmin peut inviter/ré-inviter des admins
    if (userAppRole !== 'superAdmin') {
        toast({
            title: "Permission Denied",
            description: "Only superAdmins can resend admin invitations.",
            variant: "destructive"
        });
        return;
    }
    // ... (votre logique existante pour renvoyer l'invitation) ...
    toast({ title: "Action: Resend Invite", description: `TODO: Implement resend invite for ${adminEmail}` });
  };

  if (error) {
    return <div className="text-center text-destructive">Failed to load admins: {error.message}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Administrators</h2>
        {/* Le bouton "Invite Admin" ne devrait être visible que par les superAdmins */}
        {userAppRole === 'superAdmin' && (
          <Button onClick={() => setInviteModalOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Admin
          </Button>
        )}
      </div>

      <Table>
        <TableCaption>List of all administrators in the system</TableCaption>
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
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8">
                <div className="flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </TableCell>
            </TableRow>
          ) : admins && admins.length > 0 ? (
            admins.map((adminRow) => ( // Renommé admin en adminRow pour éviter conflit avec la variable d'état
              <TableRow key={adminRow.id}>
                <TableCell>{adminRow.email}</TableCell>
                <TableCell>
                  <Badge variant={adminRow.status === 'Active' ? 'default' : 'secondary'}>
                    {adminRow.status}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(adminRow.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {/* Les actions ne sont disponibles que si l'utilisateur connecté est superAdmin */}
                  {/* Ou si c'est un admin qui regarde son propre profil (mais ici on gère une liste d'admins) */}
                  {userAppRole === 'superAdmin' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0" 
                          disabled={(revokeAdminRoleMutation.isPending && revokeAdminRoleMutation.variables === adminRow.id) || (hardDeleteUserMutation.isPending && hardDeleteUserMutation.variables === adminRow.id)}>
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditAdmin(adminRow)}>
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        {adminRow.status === 'Invited' && (
                          <DropdownMenuItem onClick={() => handleResendAdminInvite(adminRow.email)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            <span>Resend Invite</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {/* Revoke Admin Role - Uniquement pour superAdmin, et pas pour soi-même (la RPC le gère aussi) */}
                        {adminRow.id !== userId && (
                          <DropdownMenuItem
                            onClick={() => handleRevokeAdminRole(adminRow)}
                            className="text-orange-600 focus:text-orange-700 focus:bg-orange-500/10"
                            disabled={revokeAdminRoleMutation.isPending && revokeAdminRoleMutation.variables === adminRow.id}
                          >
                            {revokeAdminRoleMutation.isPending && revokeAdminRoleMutation.variables === adminRow.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <UserMinus className="mr-2 h-4 w-4" />
                            )}
                            <span>Revoke Admin Role</span>
                          </DropdownMenuItem>
                        )}

                        {/* Hard Delete User - Uniquement pour superAdmin, et pas pour soi-même */}
                        {adminRow.id !== userId && (
                          <DropdownMenuItem
                            onClick={() => handleHardDeleteUser(adminRow)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            disabled={hardDeleteUserMutation.isPending && hardDeleteUserMutation.variables === adminRow.id}
                          >
                            {hardDeleteUserMutation.isPending && hardDeleteUserMutation.variables === adminRow.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldAlert className="mr-2 h-4 w-4" />
                            )}
                            <span>Hard Delete User</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span>No actions available</span> // Ou rien, ou un message spécifique
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8">
                No administrators found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Modales - Conditionner leur ouverture/utilisation en fonction du rôle si nécessaire */}
      {userAppRole === 'superAdmin' && inviteModalOpen && (
        <UserInviteModal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          role="admin" // On invite toujours un 'admin' depuis cette table
          title="Invite Administrator"
        />
      )}
      
      {userAppRole === 'superAdmin' && editModalOpen && editingAdmin && (
        <UserEditModal 
          isOpen={editModalOpen} 
          onClose={() => {
            setEditModalOpen(false);
            setEditingAdmin(null);
          }} 
          userToEdit={editingAdmin}
          role="admin" 
          title={`Edit Admin: ${editingAdmin.email}`}
          onSuccess={() => {
             queryClient.invalidateQueries({ queryKey: ['admins'] });
          }}
        />
      )}
    </div>
  );
};

export default AdminsTable;
