// filepath: src/pages/admin/AdminDetailedSubmissionReviewPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle, AlertCircle, MessageSquare, Save, Send, ArrowLeft, ArrowRight, Eye, Download, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Database, Json } from '@/integrations/supabase/types'; // Assurez-vous que Json est exporté
import { format } from 'date-fns';

type SubmissionQuestionRpcItem = Database['public']['Functions']['get_submission_questions_for_admin_review']['Returns'][number];
type AdminClarityStatusEnum = Database['public']['Enums']['admin_clarity_status_enum'];
type QuestionnaireInfoType = Database['public']['Tables']['questionnaires']['Row'] | null;
// Simplifié pour l'info provider, adaptez si vous avez une RPC dédiée
type ProviderInfoType = { email: string | null } | null;

interface AttachmentMeta {
  name?: string | null;
  type?: string | null;
  size?: number | null;
  // Ajoutez d'autres champs si vous en stockez
}

// Helper pour récupérer les détails du questionnaire et du provider (simplifié)
const fetchQuestionnaireInfo = async (questionnaireId: string): Promise<QuestionnaireInfoType> => {
  const { data, error } = await supabase.from('questionnaires').select('*').eq('id', questionnaireId).single(); // Changé ici
  if (error) throw error;
  return data;
};
const fetchProviderInfo = async (providerId: string): Promise<ProviderInfoType> => {
  if (!providerId) return null;

  const { data, error } = await supabase
    .rpc('get_provider_email_by_admin', { p_provider_id: providerId })
    .single(); // .single() car la fonction retourne une seule ligne (ou aucune)

  if (error) {
    console.error("Error fetching provider info via RPC:", error);
    // Si l'erreur est PGRST116 (not found), on peut vouloir retourner null
    if (error.code === 'PGRST116') {
        return null;
    }
    throw error;
  }
  // data sera { email: "user@example.com" } ou null si non trouvé
  return data as ProviderInfoType;
};


const AdminDetailedSubmissionReviewPage = () => {
  const { questionnaireId, providerId } = useParams<{ questionnaireId: string; providerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const questionnaireNameFromNavState = location.state?.questionnaireName;
  const providerEmailFromNavState = location.state?.providerEmail;

  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  
  const [questionReviews, setQuestionReviews] = useState<Record<string, { // Clé: provider_response_id
    clarityStatus: AdminClarityStatusEnum;
    score?: number | null;
    internalRemark?: string | null;
    clarificationRequest?: string | null;
  }>>({});

  const [globalReviewComment, setGlobalReviewComment] = useState('');

  // --- Queries ---
  const { data: questionnaireInfo, isLoading: isLoadingQInfo } = useQuery({
    queryKey: ['questionnaireInfoForReview', questionnaireId],
    queryFn: () => fetchQuestionnaireInfo(questionnaireId!),
    enabled: !!questionnaireId,
  });

  const { data: providerInfo, isLoading: isLoadingPInfo } = useQuery({
    queryKey: ['providerInfoForReviewPage', providerId],
    queryFn: () => fetchProviderInfo(providerId!),
    enabled: !!providerId,
  });

  const { data: submissionQuestions, isLoading: isLoadingSubmission, error: errorSubmission, refetch: refetchSubmission } = useQuery({
    queryKey: ['submissionQuestionsForAdminReview', questionnaireId, providerId],
    queryFn: async () => {
      if (!questionnaireId || !providerId) return null;
      const { data, error } = await supabase.rpc('get_submission_questions_for_admin_review', {
        p_questionnaire_id: questionnaireId,
        p_provider_id: providerId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!questionnaireId && !!providerId,
  });

  useEffect(() => {
    if (submissionQuestions) {
      const initialReviews: Record<string, any> = {};
      submissionQuestions.forEach(q => {
        if (q.provider_response_id) { 
          initialReviews[q.provider_response_id] = {
            clarityStatus: q.current_admin_clarity_status || 'pending_review',
            score: q.current_admin_score,
            internalRemark: q.current_admin_internal_remark,
            clarificationRequest: q.current_admin_clarification_request,
          };
        }
      });
      setQuestionReviews(initialReviews);
      const firstPendingIndex = submissionQuestions.findIndex(q => q.provider_response_id && (initialReviews[q.provider_response_id]?.clarityStatus === 'pending_review'));
      setSelectedQuestionIndex(firstPendingIndex >= 0 ? firstPendingIndex : 0);
    }
  }, [submissionQuestions]); // AJOUTER CE useEffect

  // --- Mutations ---
  const saveIndividualReviewMutation = useMutation({
    mutationFn: async (params: {
      providerResponseId: string; // Doit être l'ID de la ligne dans provider_responses
      clarityStatus: AdminClarityStatusEnum;
      score?: number | null;
      internalRemark?: string | null;
      clarificationRequest?: string | null;
    }) => {
      const { error } = await supabase.rpc('save_admin_individual_question_review', {
        p_provider_response_id: params.providerResponseId,
        p_clarity_status: params.clarityStatus,
        p_score: params.score,
        p_internal_remark: params.internalRemark,
        p_clarification_request: params.clarificationRequest,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast({ title: "Question review saved!" });
      refetchSubmission(); // Pour mettre à jour l'état avec les données de la BDD
    },
    onError: (error: Error) => {
      toast({ title: "Error saving question review", description: error.message, variant: "destructive" });
    },
  });

  const finalizeOverallReviewMutation = useMutation({
    mutationFn: async (params: { globalComment?: string }) => {
      if (!questionnaireId || !providerId) throw new Error("Missing IDs");
      const { error } = await supabase.rpc('admin_finalize_submission_review', {
        p_questionnaire_id: questionnaireId,
        p_provider_id: providerId,
        p_global_review_comment: params.globalComment,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Overall review finalized!" });
      queryClient.invalidateQueries({ queryKey: ['adminReviewSubmissionsList'] });
      navigate('/admin/submissions-to-review');
    },
    onError: (error: Error) => {
      toast({ title: "Error finalizing review", description: error.message, variant: "destructive" });
    },
  });

  // --- Logique de la page ---
  const currentQuestionData = submissionQuestions?.[selectedQuestionIndex];
  const currentReviewState = currentQuestionData?.provider_response_id ? questionReviews[currentQuestionData.provider_response_id] : undefined;

  const handleQuestionReviewChange = (field: string, value: any) => {
    if (currentQuestionData?.provider_response_id) {
      setQuestionReviews(prev => {
        const newState = {
          ...(prev[currentQuestionData.provider_response_id!] || { clarityStatus: 'pending_review' }), // Assurer un état initial
          [field]: value,
        };
        if (field === 'clarityStatus') {
          if (value === 'clear') {
            newState.clarificationRequest = null;
          } else if (value === 'needs_clarification_requested') {
            newState.score = null;
            newState.internalRemark = null;
          }
        }
        return {
          ...prev,
          [currentQuestionData.provider_response_id!]: newState
        };
      });
    }
  };

  const handleSaveCurrentQuestionReview = () => {
    if (!currentQuestionData?.provider_response_id || !currentReviewState?.clarityStatus || currentReviewState.clarityStatus === 'pending_review') {
      toast({ title: "Cannot save", description: "Please select a clarity status ('Clear' or 'Needs Clarification').", variant: "destructive"});
      return;
    }
    if (currentReviewState.clarityStatus === 'clear' && (currentReviewState.score === undefined || currentReviewState.score === null || currentReviewState.score < 0 || currentReviewState.score > 5)) {
        toast({ title: "Cannot save", description: "Please provide a valid score (0-5) for a clear answer.", variant: "destructive"});
        return;
    }
     if (currentReviewState.clarityStatus === 'needs_clarification_requested' && (!currentReviewState.clarificationRequest || currentReviewState.clarificationRequest.trim() === '')) {
        toast({ title: "Cannot save", description: "Please provide a message for clarification request.", variant: "destructive"});
        return;
    }

    saveIndividualReviewMutation.mutate({
      providerResponseId: currentQuestionData.provider_response_id,
      clarityStatus: currentReviewState.clarityStatus,
      score: currentReviewState.clarityStatus === 'clear' ? currentReviewState.score : null,
      internalRemark: currentReviewState.clarityStatus === 'clear' ? currentReviewState.internalRemark : null,
      clarificationRequest: currentReviewState.clarityStatus === 'needs_clarification_requested' ? currentReviewState.clarificationRequest : null,
    });
  };
  
  const allQuestionsReviewedServerState = submissionQuestions && submissionQuestions.every(q => 
    !q.provider_response_id || // Si pas de réponse, on considère comme "traité" pour la finalisation
    (q.current_admin_clarity_status && q.current_admin_clarity_status !== 'pending_review')
  );
  
  const handleFinalize = () => {
    if (!allQuestionsReviewedServerState) { // Vérifier l'état serveur pour la finalisation
      toast({ title: "Cannot finalize", description: "Please ensure all questions have been reviewed and saved.", variant: "destructive"});
      return;
    }
    finalizeOverallReviewMutation.mutate({ globalComment: globalReviewComment });
  };

  // Gestion de l'affichage des pièces jointes (simplifié)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedUrlsLoading, setSignedUrlsLoading] = useState<Record<string, boolean>>({});
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; type?: string | null; name?: string | null } | null>(null);

  const getSignedUrl = async (path: string) => {
    if (!path || signedUrls[path] || signedUrlsLoading[path]) return;
    setSignedUrlsLoading(prev => ({ ...prev, [path]: true }));
    try {
      const { data, error: urlError } = await supabase.storage.from('questionnaire-attachments').createSignedUrl(path, 3600); // 1 hour
      if (urlError) throw urlError;
      if (data) setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
    } catch (error) {
      console.error('Error fetching signed URL:', error);
      toast({title: "Error", description: "Could not load attachment preview.", variant: "destructive"})
    } finally {
      setSignedUrlsLoading(prev => ({ ...prev, [path]: false }));
    }
  };
  
  const triggerDownload = (url: string, filename?: string | null) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) link.download = filename;
    else link.download = url.substring(url.lastIndexOf('/') + 1);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  if (isLoadingQInfo || isLoadingPInfo || isLoadingSubmission) {
    return <DashboardLayout title="Loading Review..."><div className="flex justify-center items-center h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div></DashboardLayout>;
  }
  if (errorSubmission) {
    return <DashboardLayout title="Error"><div className="container mx-auto p-4 text-red-600">Error loading submission: {errorSubmission.message}</div></DashboardLayout>;
  }
  if (!submissionQuestions || submissionQuestions.length === 0) {
    return <DashboardLayout title="Review"><div className="container mx-auto p-4">No questions found for this submission.</div></DashboardLayout>;
  }

  const pageTitle = `Review: ${questionnaireInfo?.name || questionnaireNameFromNavState || 'Questionnaire'}`;

  return (
    <DashboardLayout title={pageTitle}>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <Button onClick={() => navigate('/admin/submissions-to-review')} variant="outline">
                <XCircle className="h-4 w-4 mr-2" /> Close Review
            </Button>
        </div>
        <p className="text-muted-foreground mb-6">Provider: {providerInfo?.email || providerEmailFromNavState || providerId}</p>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Liste des questions (Panneau latéral) */}
          <Card className="w-full md:w-1/3 lg:w-1/4 self-start sticky top-4">
            <CardHeader><CardTitle>Questions ({submissionQuestions.length})</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-[70vh] overflow-y-auto">
              {submissionQuestions.map((q, index) => {
                const reviewStatusForThisQ = q.provider_response_id ? questionReviews[q.provider_response_id]?.clarityStatus : 'pending_review';
                return (
                <Button
                  key={q.question_id}
                  variant={selectedQuestionIndex === index ? "default" : "ghost"}
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setSelectedQuestionIndex(index)}
                >
                  <span className="truncate flex-1 text-sm">{index + 1}. {q.question_title}</span>
                  {reviewStatusForThisQ === 'clear' && <CheckCircle className="h-4 w-4 text-green-500 ml-2 flex-shrink-0" />}
                  {reviewStatusForThisQ === 'needs_clarification_requested' && <AlertCircle className="h-4 w-4 text-orange-500 ml-2 flex-shrink-0" />}
                  {reviewStatusForThisQ === 'pending_review' && <MessageSquare className="h-4 w-4 text-gray-400 ml-2 flex-shrink-0" />}
                </Button>
              )})}
            </CardContent>
          </Card>

          {/* Détail de la question sélectionnée et formulaire de révision */}
          {currentQuestionData && (
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>{selectedQuestionIndex + 1}. {currentQuestionData.question_title}</CardTitle>
                {currentQuestionData.question_description && <CardDescription className="mt-1">{currentQuestionData.question_description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <h3 className="font-semibold mb-1 text-sm text-muted-foreground">Provider's Answer:</h3>
                  <div className="p-3 border rounded-md bg-slate-50 min-h-[60px] whitespace-pre-wrap text-sm">
                    {currentQuestionData.provider_answer || <span className="text-muted-foreground italic">No answer provided.</span>}
                  </div>
                  {currentQuestionData.provider_attachment_path && (
                     <div className="mt-3">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                                if (signedUrls[currentQuestionData.provider_attachment_path!]) {
                                    const meta = currentQuestionData.provider_attachment_meta as AttachmentMeta | null; // Assertion
                                    setPreviewFile({ url: signedUrls[currentQuestionData.provider_attachment_path!], name: meta?.name, type: meta?.type });
                                    setIsPreviewModalOpen(true);
                                } else {
                                    getSignedUrl(currentQuestionData.provider_attachment_path!);
                                }
                            }}
                            disabled={signedUrlsLoading[currentQuestionData.provider_attachment_path!]}
                        >
                            {signedUrlsLoading[currentQuestionData.provider_attachment_path!] ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Eye className="h-4 w-4 mr-2"/>}
                            View Attachment ({(currentQuestionData.provider_attachment_meta as AttachmentMeta | null)?.name || 'file'})
                        </Button>
                     </div>
                  )}
                </div>

                {currentQuestionData.provider_response_id && currentReviewState && (
                  <div>
                    <h3 className="font-semibold mb-2">Admin Review:</h3>
                    <RadioGroup
                      value={currentReviewState.clarityStatus}
                      onValueChange={(value) => handleQuestionReviewChange('clarityStatus', value as AdminClarityStatusEnum)}
                      className="mb-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="clear" id={`clarity-clear-${currentQuestionData.question_id}`} />
                        <Label htmlFor={`clarity-clear-${currentQuestionData.question_id}`}>Answer is Clear</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="needs_clarification_requested" id={`clarity-needs-${currentQuestionData.question_id}`} />
                        <Label htmlFor={`clarity-needs-${currentQuestionData.question_id}`}>Needs Clarification</Label>
                      </div>
                    </RadioGroup>

                    {currentReviewState.clarityStatus === 'clear' && (
                      <div className="space-y-3 mb-4 p-4 border rounded-md bg-slate-50">
                        <div>
                          <Label htmlFor={`score-${currentQuestionData.question_id}`}>Score (0-5)</Label>
                          <Input
                            id={`score-${currentQuestionData.question_id}`}
                            type="number"
                            min="0" max="5"
                            value={currentReviewState.score ?? ''}
                            onChange={(e) => handleQuestionReviewChange('score', e.target.value === '' ? null : parseInt(e.target.value))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`internal-remark-${currentQuestionData.question_id}`}>Internal Remark (Optional)</Label>
                          <Textarea
                            id={`internal-remark-${currentQuestionData.question_id}`}
                            value={currentReviewState.internalRemark ?? ''}
                            onChange={(e) => handleQuestionReviewChange('internalRemark', e.target.value)}
                            placeholder="Internal notes for this answer..."
                            rows={2}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}

                    {currentReviewState.clarityStatus === 'needs_clarification_requested' && (
                      <div className="space-y-3 mb-4 p-4 border rounded-md bg-slate-50">
                        <div>
                          <Label htmlFor={`clarification-request-${currentQuestionData.question_id}`}>Message to Provider (Required)</Label>
                          <Textarea
                            id={`clarification-request-${currentQuestionData.question_id}`}
                            value={currentReviewState.clarificationRequest ?? ''}
                            onChange={(e) => handleQuestionReviewChange('clarificationRequest', e.target.value)}
                            placeholder="Explain what needs to be clarified..."
                            rows={3}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                    <Button onClick={handleSaveCurrentQuestionReview} disabled={saveIndividualReviewMutation.isPending || currentReviewState.clarityStatus === 'pending_review'}>
                      {saveIndividualReviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Question Review
                    </Button>
                  </div>
                )}
                {!currentQuestionData.provider_response_id && <p className="text-muted-foreground italic mt-4">This question was not answered by the provider or is new.</p>}

                <div className="mt-8 flex justify-between border-t pt-4">
                    <Button variant="outline" onClick={() => setSelectedQuestionIndex(p => Math.max(0, p - 1))} disabled={selectedQuestionIndex === 0}>
                        <ArrowLeft className="h-4 w-4 mr-2"/> Previous
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedQuestionIndex(p => Math.min((submissionQuestions?.length || 1) - 1, p + 1))} disabled={selectedQuestionIndex === (submissionQuestions?.length || 1) - 1}>
                        Next <ArrowRight className="h-4 w-4 ml-2"/>
                    </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        <Card className="mt-8">
            <CardHeader><CardTitle>Finalize Overall Review</CardTitle></CardHeader>
            <CardContent>
                <div className="mb-4">
                    <Label htmlFor="global-review-comment">Global Review Comment (Optional, visible to provider)</Label>
                    <Textarea
                        id="global-review-comment"
                        value={globalReviewComment}
                        onChange={(e) => setGlobalReviewComment(e.target.value)}
                        placeholder="Overall comments for the provider regarding this submission..."
                        className="mt-1"
                    />
                </div>
                <Button onClick={handleFinalize} disabled={!allQuestionsReviewedServerState || finalizeOverallReviewMutation.isPending} size="lg">
                    {finalizeOverallReviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {allQuestionsReviewedServerState ? 'Finalize and Notify Provider' : 'Review All Questions to Finalize'}
                </Button>
                {!allQuestionsReviewedServerState && <p className="text-sm text-muted-foreground mt-2">All questions must be reviewed and saved before finalizing.</p>}
            </CardContent>
        </Card>
      </div>

      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewFile?.name || "Attachment Preview"}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 max-h-[80vh] overflow-auto">
            {previewFile?.url && (
              previewFile.type?.startsWith('image/') ? (
                <img src={previewFile.url} alt={previewFile.name || 'Preview'} className="max-w-full h-auto rounded-md" />
              ) : previewFile.type === 'application/pdf' ? (
                <iframe src={previewFile.url} title={previewFile.name || 'PDF Preview'} className="w-full h-[75vh]" frameBorder="0" />
              ) : (
                <div className="p-4 text-center">
                  <p className="text-muted-foreground mb-2">Cannot preview this file type directly.</p>
                  <p className="font-medium">{previewFile.name}</p>
                </div>
              )
            )}
          </div>
          <DialogFooter className="mt-4">
            {previewFile?.url && 
                <Button variant="outline" onClick={() => triggerDownload(previewFile.url, (previewFile.name as AttachmentMeta | null)?.name)}>
                    <Download className="h-4 w-4 mr-2"/> Download
                </Button>
            }
            <Button variant="ghost" onClick={() => setIsPreviewModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminDetailedSubmissionReviewPage;
