import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore, AppRole } from '@/stores/authStore'; // Importer AppRole
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from "sonner";
import { Loader2, AlertTriangle, Mail, MailOpen, BellRing, CheckCircle2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useState } from 'react';

type Notification = Database["public"]["Tables"]["notifications"]["Row"] & {
  submitted_by_provider_id?: string | null; // Ajouter le nouveau champ
};

const NOTIFICATIONS_PER_PAGE = 10;

const fetchNotifications = async (userId: string, page: number): Promise<{ notifications: Notification[], count: number | null }> => {
  const from = (page - 1) * NOTIFICATIONS_PER_PAGE;
  const to = from + NOTIFICATIONS_PER_PAGE - 1;

  const { data, error, count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching notifications:', error);
    throw new Error(error.message);
  }
  return { notifications: data || [], count };
};

const markNotificationAsRead = async (notificationId: string): Promise<Notification | null> => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() }) // Ensure read_at is updated
    .eq('id', notificationId)
    .select()
    .single();

  if (error) {
    console.error('Error marking notification as read:', error);
    throw new Error(error.message);
  }
  return data;
};

const NotificationsPage = () => {
  const { user, userAppRole } = useAuthStore(state => ({ // Récupérer userAppRole
    user: state.user,
    userAppRole: state.userAppRole,
  }));
  const queryClient = useQueryClient();
  const navigate = useNavigate(); // <-- ADD useNavigate
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<{ notifications: Notification[], count: number | null }, Error, { notifications: Notification[], count: number | null }, readonly (string | number | undefined)[]>({
    queryKey: ['notifications', user?.id, currentPage],
    queryFn: () => fetchNotifications(user!.id, currentPage),
    enabled: !!user?.id,
    placeholderData: (previousData) => previousData, // MODIFIED HERE
  });

  const totalPages = data?.count ? Math.ceil(data.count / NOTIFICATIONS_PER_PAGE) : 0;

  const markAsReadMutation = useMutation<Notification | null, Error, string, unknown>({
    mutationFn: markNotificationAsRead, // MODIFIED HERE
    onSuccess: (updatedNotification) => {
      if (updatedNotification) {
        queryClient.setQueryData<{ notifications: Notification[], count: number | null } | undefined>(
          ['notifications', user?.id, currentPage],
          (oldData) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              notifications: oldData.notifications.map(n =>
                n.id === updatedNotification.id ? updatedNotification : n
              ),
            };
          }
        );
        // Invalidate unread count query for the badge in the top bar
        queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount', user?.id] }); // MODIFIED HERE
        toast.success("Notification marked as read.");
      }
    },
    onError: (err) => {
      toast.error(`Failed to mark as read: ${err.message}`);
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (notification.status !== 'read') {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.questionnaire_id) {
      if (userAppRole === 'admin' || userAppRole === 'superAdmin') {
        if (notification.submitted_by_provider_id) {
          // Passer le corps de la notification pour extraire l'email si besoin sur la page de destination
          navigate(`/admin/questionnaires/${notification.questionnaire_id}/responses/${notification.submitted_by_provider_id}`, {
            state: { notificationBody: notification.body }
          });
        } else {
          toast.error("Provider information missing for this submission notification.");
          // Optionnellement, rediriger vers une page de questionnaire générique pour admin
          // navigate(`/admin/questionnaires/${notification.questionnaire_id}`); 
        }
      } else if (userAppRole === 'provider') {
        navigate(`/provider/questionnaires/${notification.questionnaire_id}`);
      }
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Notifications">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Notifications">
        <div className="flex flex-col items-center justify-center h-64 text-destructive">
          <AlertTriangle className="h-12 w-12 mb-4" />
          <p className="text-xl">Error loading notifications</p>
          <p>{error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Notifications">
      <div className="space-y-6">
        {data?.notifications && data.notifications.length > 0 ? (
          data.notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`cursor-pointer transition-colors duration-150 ${
                notification.status === 'unread' ? 'bg-primary/5 hover:bg-primary/10 border-primary/20' : 'bg-card hover:bg-muted/50'
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {notification.status === 'unread' ? (
                      <Mail className="h-5 w-5 mr-3 text-primary" />
                    ) : (
                      <MailOpen className="h-5 w-5 mr-3 text-muted-foreground" />
                    )}
                    <CardTitle className="text-md">
                      {notification.title || 'Notification'}
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(notification.created_at).toLocaleString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className={notification.status === 'unread' ? 'font-medium' : ''}>
                  {notification.body || 'No content.'} {/* MODIFIED HERE from message to body */}
                </CardDescription>
                {/* You can add action buttons or links here based on notification type */}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-10">
            <BellRing className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-xl font-semibold">No notifications</p>
            <p className="text-muted-foreground">You're all caught up!</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-6">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || isFetching}
              variant="outline"
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || isFetching}
              variant="outline"
            >
              Next
            </Button>
          </div>
        )}
         {isFetching && <div className="flex justify-center mt-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;