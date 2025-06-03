import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { Loader2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types'; // Cet import est correct

// Utilisez directement le type de retour de la fonction RPC
// C'est le type pour un seul élément du tableau retourné par la fonction RPC
type AssignedQuestionnaireRpcItem = Database["public"]["Functions"]["get_assigned_questionnaires_overview_for_admin"]["Returns"][number];

// Supprimez votre définition manuelle de AssignedQuestionnaireAdminOverview si elle est identique à AssignedQuestionnaireRpcItem
// export type AssignedQuestionnaireAdminOverview = { /* ... */ };

const fetchAssignedQuestionnaires = async (): Promise<AssignedQuestionnaireRpcItem[]> => {
  const { data: rpcData, error } = await supabase
    .rpc('get_assigned_questionnaires_overview_for_admin');

  if (error) {
    console.error('Error fetching assigned questionnaires overview:', error);
    throw error;
  }
  // Le type rpcData est déjà Database["public"]["Functions"]["get_assigned_questionnaires_overview_for_admin"]["Returns"]
  // qui est AssignedQuestionnaireRpcItem[] | null
  return (rpcData || []) as AssignedQuestionnaireRpcItem[]; // Le cast peut être nécessaire si rpcData peut être null
};

const AssignedQuestionnairesTable = () => {
  const navigate = useNavigate();
  // Utilisez AssignedQuestionnaireRpcItem ici
  const { data: questionnaires, isLoading, error } = useQuery<AssignedQuestionnaireRpcItem[], Error>({
    queryKey: ['assignedQuestionnairesOverviewForAdmin'],
    queryFn: fetchAssignedQuestionnaires,
  });

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'submitted': return 'default'; // Changed from 'success' to 'default'
      case 'in_progress': return 'default';
      case 'pending': return 'secondary';
      default: return 'outline';
    }
  };

  // Assurez-vous que le paramètre item utilise AssignedQuestionnaireRpcItem
  const handleViewDetails = (item: AssignedQuestionnaireRpcItem) => {
    // Si soumis, aller à la page de revue. Sinon, peut-être une page de détail différente ou pas d'action.
    if (item.status === 'submitted') {
      navigate(`/admin/questionnaires/${item.questionnaire_id}/responses/${item.provider_id}`);
    } else {
      // Pour l'instant, pas d'action pour les autres statuts, mais on pourrait en ajouter
      console.log("Viewing details for non-submitted questionnaire:", item);
    }
  };


  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error) {
    return <div className="text-center text-destructive py-8">Failed to load assigned questionnaires: {error.message}</div>;
  }

  return (
    <div className="space-y-5">
       <h2 className="text-xl font-semibold">Questionnaire Assignments Overview</h2>
      <Table>
        <TableCaption>Overview of questionnaires assigned to providers and their status.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Questionnaire</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned At</TableHead>
            <TableHead>Last Activity</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questionnaires && questionnaires.length > 0 ? (
            questionnaires.map((item) => ( // item sera de type AssignedQuestionnaireRpcItem
              <TableRow key={`${item.questionnaire_id}-${item.provider_id}`}>
                <TableCell className="font-medium">{item.questionnaire_name}</TableCell>
                <TableCell>{item.provider_email || item.provider_id}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>{item.assigned_at ? new Date(item.assigned_at).toLocaleDateString() : 'N/A'}</TableCell>
                <TableCell>{item.last_saved_at ? new Date(item.last_saved_at).toLocaleString() : (item.submitted_at ? new Date(item.submitted_at).toLocaleString() : 'N/A')}</TableCell>
                <TableCell className="text-right">
                  {item.status === 'submitted' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(item)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Review
                    </Button>
                  )}
                  {/* Ajouter d'autres actions si nécessaire */}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                No questionnaires currently assigned or tracked.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default AssignedQuestionnairesTable;