import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AdminDisplayInfo } from './AdminsTable'; // Ajustez si le type est différent/partagé
import type { ProviderDisplayInfo } from './ProvidersTable'; // Ajustez si le type est différent/partagé
import { Json } from '@/integrations/supabase/types';

// Schéma de validation pour le formulaire d'édition
// Pour l'instant, permettons de modifier un champ "displayName" dans user_metadata
const userEditSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters").max(100).optional().nullable(),
  // Ajoutez d'autres champs modifiables ici si nécessaire
});

type UserEditFormValues = z.infer<typeof userEditSchema>;

type UserToEdit = AdminDisplayInfo | ProviderDisplayInfo; // Type unifié

type UserEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userToEdit: UserToEdit | null;
  role: 'admin' | 'provider'; // Pour savoir quel type d'utilisateur on édite
  title: string;
  onSuccess: () => void; // Callback en cas de succès
};

const UserEditModal = ({ isOpen, onClose, userToEdit, role, title, onSuccess }: UserEditModalProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue
  } = useForm<UserEditFormValues>({
    resolver: zodResolver(userEditSchema),
  });

  useEffect(() => {
    if (userToEdit) {
      const fetchUserDetails = async () => {
        setIsLoading(true); // Indiquer le chargement des données initiales
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_details_by_admin', {
            p_user_id_to_fetch: userToEdit.id,
          });

          if (rpcError) {
            throw rpcError;
          }

          // La RPC retourne un tableau, même pour un seul utilisateur
          const userData = rpcData && rpcData.length > 0 ? rpcData[0] : null;

          if (!userData) {
            toast({ title: "Error", description: "Could not fetch user details.", variant: "destructive" });
            setValue('displayName', userToEdit.email.split('@')[0] || ''); // Fallback
            return;
          }
          // Assurez-vous que raw_user_meta_data est un objet avant d'accéder à displayName
          const metadata = userData.raw_user_meta_data && typeof userData.raw_user_meta_data === 'object' 
                           ? userData.raw_user_meta_data as { displayName?: string } 
                           : {};
          setValue('displayName', metadata?.displayName || userToEdit.email.split('@')[0] || '');
        } catch (error: any) {
          toast({ title: "Error", description: `Failed to load user details: ${error.message}`, variant: "destructive" });
          setValue('displayName', userToEdit.email.split('@')[0] || ''); // Fallback
        } finally {
          setIsLoading(false);
        }
      };
      fetchUserDetails();
    } else {
      reset({ displayName: '' });
    }
  }, [userToEdit, setValue, reset, toast]);

  const onSubmit = async (data: UserEditFormValues) => {
    if (!userToEdit) return;

    setIsLoading(true);
    try {
      // Récupérer les métadonnées existantes pour la fusion
      const { data: rpcDetailsData, error: fetchError } = await supabase.rpc('get_user_details_by_admin', {
        p_user_id_to_fetch: userToEdit.id,
      });

      if (fetchError || !rpcDetailsData || rpcDetailsData.length === 0) {
        throw fetchError || new Error("User details not found for metadata update.");
      }
      
      const currentUserData = rpcDetailsData[0];
      const existingMetadata = (currentUserData.raw_user_meta_data as Json) || ({} as Json);
      
      const newMetadata = {
        ...(typeof existingMetadata === 'object' && existingMetadata !== null ? existingMetadata : {}), // Assurer que existingMetadata est un objet
        displayName: data.displayName,
        // Mettez à jour d'autres champs de métadonnées ici si nécessaire
      };

      const { error: updateError } = await supabase.rpc('update_user_metadata_by_admin', {
        p_user_id_to_update: userToEdit.id,
        p_new_metadata: newMetadata,
      });

      if (updateError) {
        throw updateError;
      }

      toast({ title: "Success", description: `${role === 'admin' ? 'Admin' : 'Provider'} updated successfully.` });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(`Error updating ${role}:`, error);
      toast({ 
        title: "Error", 
        description: `Failed to update ${role}: ${error.message}`, 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!userToEdit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Edit the details for {userToEdit.email}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email-display">Email (cannot be changed here)</Label>
            <Input
              id="email-display"
              type="email"
              value={userToEdit.email}
              disabled
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="Enter display name"
              disabled={isLoading}
              {...register('displayName')}
            />
            {errors.displayName && (
              <p className="text-sm text-destructive">{errors.displayName.message}</p>
            )}
          </div>

          {/* Ajoutez d'autres champs ici si nécessaire */}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserEditModal;