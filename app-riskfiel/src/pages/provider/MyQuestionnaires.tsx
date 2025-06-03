// filepath: c:\Users\chett\Desktop\projets\RiskFiel\app-riskfiel\src\pages\provider\MyQuestionnaires.tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge'; // Assurez-vous que Badge est importé
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Questionnaire = Database["public"]["Tables"]["questionnaires"]["Row"];
type Notification = Database["public"]["Tables"]["notifications"]["Row"] & {
    questionnaire_id?: string | null; 
};
type ProviderQuestionnaireStatus = Database["public"]["Tables"]["provider_questionnaire_status"]["Row"];

type QuestionnaireWithStatus = Questionnaire & Partial<Omit<ProviderQuestionnaireStatus, 'id' | 'questionnaire_id' | 'provider_id'>>;


const fetchProviderQuestionnairesWithStatus = async (providerId: string): Promise<QuestionnaireWithStatus[]> => {
  const { data: questionnairesData, error: qError } = await supabase
    .from('questionnaires')
    .select(`
      *,
      provider_questionnaire_status!inner (
        status,
        last_saved_at,
        submitted_at,
        review_status,
        score,
        review_comment,
        reviewed_at,
        reviewed_by_admin_id
      )
    `)
    .eq('provider_questionnaire_status.provider_id', providerId)
    .order('created_at', { ascending: false });

  if (qError) {
    console.error('Error fetching provider questionnaires with status:', qError);
    throw new Error(qError.message);
  }
  
  return (questionnairesData || []).map(q => {
    // provider_questionnaire_status est maintenant un objet unique grâce à !inner
    const statusInfo = q.provider_questionnaire_status as unknown as ProviderQuestionnaireStatus; 
    return { ...q, ...statusInfo };
  });
};

const fetchProviderQuestionnaires = async (providerId: string): Promise<Questionnaire[]> => {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('*')
    .contains('provider_ids', [providerId]) // Check if provider_ids array contains the providerId
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching provider questionnaires:', error);
    throw new Error(error.message);
  }
  return data || [];
};

const fetchUnreadNotifications = async (userId: string): Promise<Notification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, questionnaire_id') // Ensure questionnaire_id is selected
    .eq('user_id', userId)
    .eq('status', 'unread'); // Assuming 'unread' is the status for new notifications

  if (error) {
    console.error('Error fetching unread notifications:', error);
    throw new Error(error.message);
  }
  return data || [];
};

const MyQuestionnairesPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient(); // Ajouté pour l'invalidation potentielle

  const {
    data: questionnaires,
    isLoading: isLoadingQuestionnaires,
    error: errorQuestionnaires,
  } = useQuery<QuestionnaireWithStatus[], Error>({
    queryKey: ['providerQuestionnairesWithStatus', user?.id],
    queryFn: () => fetchProviderQuestionnairesWithStatus(user!.id),
    enabled: !!user?.id,
  });

  const {
    data: unreadNotifications,
    isLoading: isLoadingNotifications,
    error: errorNotifications,
  } = useQuery<Notification[], Error>({
    queryKey: ['unreadProviderNotifications', user?.id],
    queryFn: () => fetchUnreadNotifications(user!.id),
    enabled: !!user?.id,
  });

  const getIsNew = (questionnaireId: string): boolean => {
    if (!unreadNotifications) return false;
    return unreadNotifications.some(
      (notification) => notification.questionnaire_id === questionnaireId
    );
  };

  const handleCardClick = (questionnaireId: string) => {
    // Mark related notifications as read (optional, implement if needed)
    // Example:
    // const relatedNotifs = unreadNotifications?.filter(n => n.questionnaire_id === questionnaireId);
    // if (relatedNotifs && relatedNotifs.length > 0) {
    //   relatedNotifs.forEach(async (notif) => {
    //     await supabase.from('notifications').update({ status: 'read' }).eq('id', notif.id);
    //   });
    //   // Optionally refetch notifications here or update local state
    // }
    navigate(`/provider/questionnaires/${questionnaireId}`);
  };

  if (isLoadingQuestionnaires || isLoadingNotifications) {
    return (
      <DashboardLayout title="My Questionnaires">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (errorQuestionnaires || errorNotifications) {
    return (
      <DashboardLayout title="My Questionnaires">
        <div className="flex flex-col items-center justify-center h-64 text-destructive">
          <AlertTriangle className="h-12 w-12 mb-4" />
          <p className="text-xl">Error loading data</p>
          <p>{errorQuestionnaires?.message || errorNotifications?.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="My Questionnaires">
      <div className="space-y-6">
        {questionnaires && questionnaires.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {questionnaires.map((q) => (
              <Card
                key={q.id}
                className="cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col"
                onClick={() => handleCardClick(q.id)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{q.name}</CardTitle>
                    <div className="flex items-center space-x-2">
                      {getIsNew(q.id) && <Badge variant="destructive">New</Badge>}
                      {(() => {
                        if (q.status === 'reviewed') {
                          return <Badge variant="success">Reviewed{q.score !== null ? `: ${q.score}/5` : ''}</Badge>;
                        }
                        if (q.status === 'needs_clarification') {
                          return <Badge variant="warning">Needs Clarification</Badge>;
                        }
                        if (q.status === 'submitted') { // review_status can be 'pending' or 'clarification_provided'
                          return <Badge variant="secondary">Submitted</Badge>;
                        }
                        if (q.status === 'in_progress') {
                          return <Badge variant="outline">In Progress</Badge>;
                        }
                        if (q.status === 'pending') {
                          return <Badge variant="info">Pending Start</Badge>;
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  {q.description && (
                    <CardDescription className="text-sm pt-1 line-clamp-3">
                      {q.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-grow">
                  {/* Additional content can go here if needed */}
                </CardContent>
                <CardFooter>
                  <p className="text-xs text-muted-foreground">
                    Assigned: {new Date(q.created_at).toLocaleDateString()}
                  </p>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-xl font-semibold">No questionnaires assigned</p>
            <p className="text-muted-foreground">You currently have no questionnaires assigned to you.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyQuestionnairesPage;