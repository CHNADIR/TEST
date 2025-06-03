import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Edit3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type AdminReviewSubmissionItem = Database['public']['Functions']['get_admin_review_submissions_list']['Returns'][number];

const fetchSubmissionsForReview = async (): Promise<AdminReviewSubmissionItem[]> => {
  const { data, error } = await supabase.rpc('get_admin_review_submissions_list');
  if (error) {
    console.error('Error fetching submissions for review:', error);
    throw error;
  }
  return data || [];
};

const AdminSubmissionsListPage = () => {
  const navigate = useNavigate();
  const { data: submissions, isLoading, error } = useQuery<AdminReviewSubmissionItem[], Error>({
    queryKey: ['adminReviewSubmissionsList'],
    queryFn: fetchSubmissionsForReview,
  });

  const handleStartReview = (submission: AdminReviewSubmissionItem) => {
    navigate(`/admin/review-submission/${submission.questionnaire_id}/${submission.provider_id}`, {
      state: {
        questionnaireName: submission.questionnaire_name,
        providerEmail: submission.provider_email,
      }
    });
  };

  const getStatusBadgeVariant = (status?: string | null): "default" | "secondary" | "destructive" | "outline" | "warning" | "success" => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'clarification_provided':
        return 'default'; // Ou une autre couleur pour indiquer une resoumission
      case 'reviewed':
        return 'success';
      case 'needs_clarification':
        return 'destructive';
      default:
        return 'secondary';
    }
  };


  return (
    <DashboardLayout title="Review Submissions">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Submissions Awaiting Review</h1>
        {isLoading && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="text-center py-10 text-red-600">
            <p>Error loading submissions: {error.message}</p>
          </div>
        )}
        {!isLoading && !error && submissions && (
          <Table>
            <TableCaption>{submissions.length === 0 ? 'No submissions currently awaiting review.' : 'A list of questionnaire submissions awaiting review.'}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Questionnaire</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Review Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((submission) => (
                <TableRow key={submission.submission_id}>
                  <TableCell className="font-medium">{submission.questionnaire_name}</TableCell>
                  <TableCell>{submission.provider_email}</TableCell>
                  <TableCell>
                    {submission.submitted_at ? format(new Date(submission.submitted_at), 'PPpp') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(submission.review_status)}>
                      {submission.review_status?.replace(/_/g, ' ') || 'N/A'}
                    </Badge>
                     {submission.global_status === 'needs_clarification' && submission.review_status === 'clarification_provided' && (
                        <Badge variant="outline" className="ml-2">Resubmitted</Badge>
                     )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartReview(submission)}
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      {submission.review_status === 'clarification_provided' ? 'Continue Review' : 'Start Review'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminSubmissionsListPage;