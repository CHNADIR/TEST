import { useEffect, useState } from 'react'; // Removed React default import and useCallback
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, AlertTriangle, Paperclip, XCircle, Save, Edit3, CheckCircle } from 'lucide-react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import type { Database } from '@/integrations/supabase/types';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

type Questionnaire = Database['public']['Tables']['questionnaires']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];
type ProviderResponse = Database['public']['Tables']['provider_responses']['Row'];
type ProviderQuestionnaireStatus = Database['public']['Tables']['provider_questionnaire_status']['Row'];

interface AnsweredQuestion extends Question {
  currentAnswer: string | null;
  savedAnswer: string | null;
  isEditing: boolean;
  lastSavedAt: string | null;
  isSaving: boolean;
  attachmentFile?: File | null;
  attachmentPath?: string | null;
  attachmentMeta?: Record<string, any> | null;
  isUploading?: boolean;
  is_required: boolean; // Added is_required
  admin_clarification_request?: string | null; // Added for admin's per-question clarification
}

// Fonctions fetch existantes (fetchQuestionnaireDetails, fetchQuestionsByIds) ...
const fetchQuestionnaireDetails = async (questionnaireId: string): Promise<Questionnaire | null> => {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('*')
    .eq('id', questionnaireId)
    .single();
  if (error) {
    console.error('Error fetching questionnaire details:', error);
    throw error;
  }
  return data;
};

const fetchQuestionsByIds = async (questionIds: string[]): Promise<Question[]> => {
  if (!questionIds || questionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('id', questionIds);
  if (error) {
    console.error('Error fetching questions by IDs:', error);
    throw error;
  }
  return data || [];
};

// Fonction pour récupérer les *dernières* réponses sauvegardées par le fournisseur pour ce questionnaire
const fetchLatestProviderAnswers = async (questionnaireId: string, providerId: string): Promise<ProviderResponse[]> => {
  if (!questionnaireId || !providerId) return [];
  // Cette requête récupère la dernière réponse pour chaque question pour ce questionnaire et ce fournisseur
  // Elle peut être optimisée avec une fonction RPC ou une vue si elle devient lente.
  const { data, error } = await supabase.rpc('get_provider_latest_answers_for_questionnaire', {
    p_questionnaire_id: questionnaireId,
    p_provider_id: providerId
  });

  if (error) {
    console.error('Error fetching latest provider answers:', error);
    // throw error; // Decide if this should throw or return empty on error
  }
  return data || [];
};
// Assurez-vous que la fonction RPC get_provider_latest_answers_for_questionnaire existe:
/*
-- SQL pour get_provider_latest_answers_for_questionnaire (à ajouter à schema.sql si pas déjà fait)
CREATE OR REPLACE FUNCTION get_provider_latest_answers_for_questionnaire(
    p_questionnaire_id UUID,
    p_provider_id UUID
)
RETURNS SETOF public.provider_responses AS $$
BEGIN
    RETURN QUERY
    SELECT pr.*
    FROM public.provider_responses pr
    INNER JOIN (
        SELECT question_id, MAX(submitted_at) as max_submitted_at
        FROM public.provider_responses
        WHERE questionnaire_id = p_questionnaire_id AND provider_id = p_provider_id
        GROUP BY question_id
    ) latest_pr
    ON pr.question_id = latest_pr.question_id AND pr.submitted_at = latest_pr.max_submitted_at
    WHERE pr.questionnaire_id = p_questionnaire_id AND pr.provider_id = p_provider_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION get_provider_latest_answers_for_questionnaire(UUID, UUID) TO authenticated;
*/

const fetchProviderQuestionnaireStatus = async (questionnaireId: string, providerId: string): Promise<ProviderQuestionnaireStatus | null> => {
  if (!questionnaireId || !providerId) return null;
  const { data, error } = await supabase
    .from('provider_questionnaire_status')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .eq('provider_id', providerId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') { // No rows found, which is fine
        return null;
    }
    console.error('Error fetching provider questionnaire status:', error);
    // throw error; // Decide if this should throw or return null
  }
  return data;
};

const QuestionnaireDetailPage = () => {
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestion[]>([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const { questionnaireId } = useParams<{ questionnaireId: string }>();
  const { user } = useAuthStore();
  const providerId = user?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: questionnaire, isLoading: isLoadingQuestionnaire, error: errorQuestionnaire } = useQuery<Questionnaire | null, Error, Questionnaire | null, readonly (string | undefined)[]>({
    queryKey: ['questionnaireDetails', questionnaireId],
    queryFn: () => questionnaireId ? fetchQuestionnaireDetails(questionnaireId) : Promise.resolve(null),
    enabled: !!questionnaireId,
  });

  const { data: questionsFromDB, isLoading: isLoadingQuestions, error: errorQuestions } = useQuery<Question[], Error, Question[], readonly (string | string[] | undefined)[]>({
    queryKey: ['questionnaireQuestions', questionnaire?.id, questionnaire?.question_ids],
    queryFn: () => (questionnaire?.question_ids && questionnaire.question_ids.length > 0) ? fetchQuestionsByIds(questionnaire.question_ids) : Promise.resolve([]),
    enabled: !!questionnaire && !!questionnaire.question_ids && questionnaire.question_ids.length > 0,
  });

  const { data: latestSavedAnswers, isLoading: isLoadingSavedAnswers } = useQuery<ProviderResponse[], Error, ProviderResponse[], readonly (string | undefined)[]>({
    queryKey: ['latestProviderAnswers', questionnaireId, user?.id],
    queryFn: () => (questionnaireId && user?.id) ? fetchLatestProviderAnswers(questionnaireId, user.id) : Promise.resolve([]),
    enabled: !!questionnaireId && !!user?.id && !!questionsFromDB,
  });

  const { data: providerStatus, isLoading: isLoadingProviderStatus, refetch: refetchProviderStatus } = useQuery<ProviderQuestionnaireStatus | null, Error>({
    queryKey: ['providerQuestionnaireStatus', questionnaireId, user?.id],
    queryFn: () => (questionnaireId && user?.id) ? fetchProviderQuestionnaireStatus(questionnaireId, user.id) : Promise.resolve(null),
    enabled: !!questionnaireId && !!user?.id,
  });


  useEffect(() => {
    if (questionsFromDB && latestSavedAnswers) {
      const initialAnsweredQuestions = questionsFromDB.map(q => {
        const savedResponse = latestSavedAnswers.find(r => r.question_id === q.id);
        return {
          ...q,
          currentAnswer: savedResponse?.answer || null,
          savedAnswer: savedResponse?.answer || null,
          isEditing: !savedResponse?.answer, // Start in editing if no saved answer
          lastSavedAt: savedResponse?.submitted_at || null,
          isSaving: false,
          attachmentPath: savedResponse?.attachment_path || null,
          attachmentMeta: savedResponse?.attachment_meta as Record<string, any> || null,
          attachmentFile: null,
          is_required: (q as Question & { is_required?: boolean }).is_required ?? false, // Ensure is_required has a default
          admin_clarification_request: savedResponse?.admin_clarification_request || null,
        };
      });
      setAnsweredQuestions(initialAnsweredQuestions);
      if (!expandedQuestionId && initialAnsweredQuestions.length > 0) {
        // Keep existing logic for expandedQuestionId or refactor separately if needed
        // setExpandedQuestionId(initialAnsweredQuestions[0].id);
      }
    } else if (questionsFromDB) {
        const initialAnsweredQuestions = questionsFromDB.map(q => ({
            ...q,
            currentAnswer: null,
            savedAnswer: null,
            isEditing: true,
            lastSavedAt: null,
            isSaving: false,
            attachmentFile: null,
            attachmentPath: null,
            attachmentMeta: null,
            is_required: (q as Question & { is_required?: boolean }).is_required ?? false, // Ensure is_required has a default
            admin_clarification_request: null,
        }));
        setAnsweredQuestions(initialAnsweredQuestions);
        if (!expandedQuestionId && initialAnsweredQuestions.length > 0) {
            // Keep existing logic for expandedQuestionId or refactor séparément si nécessaire
            // setExpandedQuestionId(initialAnsweredQuestions[0].id);
        }
    }
  }, [questionsFromDB, latestSavedAnswers]); // Removed expandedQuestionId, setExpandedQuestionId from deps for data init

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnsweredQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, currentAnswer: value } : q))
    );
  };

  const handleFileChange = (questionId: string, file: File | null) => {
    setAnsweredQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, attachmentFile: file, attachmentPath: file ? null : q.attachmentPath, attachmentMeta: file ? null : q.attachmentMeta } : q))
    );
  };

  const handleRemoveAttachment = (questionId: string) => {
    setAnsweredQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, attachmentFile: null, attachmentPath: null, attachmentMeta: null } : q))
    );
  };

  const uploadAttachment = async (questionId: string, file: File): Promise<{ path: string; metadata: Record<string, any> } | null> => {
    if (!questionnaireId || !providerId) {
      toast({ title: "Upload Error", description: "Cannot upload attachment: missing questionnaire or provider ID.", variant: "destructive" });
      return null;
    }
    setAnsweredQuestions(prev => prev.map(q => q.id === questionId ? { ...q, isUploading: true } : q));
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${questionnaireId}/${providerId}/${questionId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('questionnaire-attachments')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Error uploading attachment:', uploadError);
        toast({ title: "Upload Failed", description: `Attachment upload failed for question ${questionId.substring(0,8)}...: ${uploadError.message}`, variant: "destructive" });
        return null;
      }

      const metadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      };
      setAnsweredQuestions(prev => prev.map(q => q.id === questionId ? { ...q, attachmentPath: filePath, attachmentMeta: metadata, attachmentFile: null, isUploading: false } : q));
      return { path: filePath, metadata };
    } catch (error: any) {
      console.error('Client-side error during attachment upload:', error);
      toast({ title: "Upload Failed", description: `Attachment upload failed: ${error.message}`, variant: "destructive" });
      return null;
    } finally {
      setAnsweredQuestions(prev => prev.map(q => q.id === questionId ? { ...q, isUploading: false } : q));
    }
  };


  const saveSingleAnswerMutation = useMutation({
    mutationFn: async (params: { questionId: string; answer: string | null }) => {
      if (!questionnaireId) throw new Error("Questionnaire ID is missing.");
      
      const questionState = answeredQuestions.find(q => q.id === params.questionId);
      if (!questionState) throw new Error("Question state not found.");

      setAnsweredQuestions(prev => prev.map(q => q.id === params.questionId ? {...q, isSaving: true} : q));

      let attachmentPath: string | null = questionState.attachmentPath || null;
      let attachmentMeta: Record<string, any> | null = questionState.attachmentMeta || null;

      if (questionState.attachmentFile) {
        const uploadResult = await uploadAttachment(params.questionId, questionState.attachmentFile);
        if (uploadResult) {
          attachmentPath = uploadResult.path;
          attachmentMeta = uploadResult.metadata;
        } else {
          setAnsweredQuestions(prev => prev.map(q => q.id === params.questionId ? {...q, isSaving: false} : q));
          throw new Error("Attachment upload failed, answer not saved.");
        }
      } else if (attachmentPath && !questionState.attachmentFile && !questionState.attachmentPath) { 
        attachmentPath = null;
        attachmentMeta = null;
      }

      const { data: savedResponse, error } = await supabase.rpc('save_provider_single_answer', {
        p_questionnaire_id: questionnaireId,
        p_question_id: params.questionId,
        p_answer: params.answer,
        p_attachment_path: attachmentPath,
        p_attachment_meta: attachmentMeta,
      });
      if (error) throw error;
      const responseData = savedResponse as unknown as ProviderResponse; 
      return { questionId: params.questionId, savedResponse: responseData };
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: "Answer saved!" });
      setAnsweredQuestions(prev =>
        prev.map(q =>
          q.id === data.questionId
            ? {
                ...q,
                savedAnswer: data.savedResponse.answer,
                lastSavedAt: data.savedResponse.submitted_at,
                attachmentPath: data.savedResponse.attachment_path || null,
                attachmentMeta: data.savedResponse.attachment_meta as Record<string, any> || null,
                attachmentFile: null, 
                isEditing: false,
                isSaving: false,
              }
            : q
        )
      );
      queryClient.invalidateQueries({ queryKey: ['providerQuestionnaireStatus', questionnaireId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['latestProviderAnswers', questionnaireId, user?.id] });
    },
    onError: (error: Error, variables) => {
      toast({ title: "Save Error", description: `Failed to save answer: ${error.message}`, variant: "destructive" });
      setAnsweredQuestions(prev => prev.map(q => q.id === variables.questionId ? {...q, isSaving: false, isUploading: false} : q));
    },
  });

  const handleSaveSingleAnswer = (questionId: string) => {
    const question = answeredQuestions.find(q => q.id === questionId);
    if (question) {
      saveSingleAnswerMutation.mutate({ questionId, answer: question.currentAnswer });
    }
  };

  const handleEditAnswer = (questionId: string) => {
    setAnsweredQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, isEditing: true } : q))
    );
  };
  
  const handleCancelEdit = (questionId: string) => {
    setAnsweredQuestions(prev =>
      prev.map(q => (q.id === questionId ? { ...q, currentAnswer: q.savedAnswer, isEditing: false } : q))
    );
  };


  const submitAnswersMutation = useMutation({
    mutationFn: async () => {
      if (!questionnaireId || !providerId) {
        toast({ title: "Submission Error", description: "Cannot submit: Questionnaire ID or Provider ID is missing.", variant: "destructive" });
        throw new Error("Questionnaire ID or Provider ID is missing.");
      }

      const answersWithAttachmentsProcessed = await Promise.all(
        answeredQuestions.map(async (aq) => {
          let finalAttachmentPath = aq.attachmentPath;
          let finalAttachmentMeta = aq.attachmentMeta;

          if (aq.attachmentFile && (!aq.attachmentPath || (aq.attachmentPath && aq.attachmentFile.name !== aq.attachmentMeta?.name))) {
            const uploadResult = await uploadAttachment(aq.id, aq.attachmentFile);
            if (uploadResult) {
              finalAttachmentPath = uploadResult.path;
              finalAttachmentMeta = uploadResult.metadata;
            } else {
              toast({ title: "Upload Error", description: `Failed to upload attachment for question "${aq.title || aq.id.substring(0,8)}...". Submission aborted.`, variant: "destructive" });
              throw new Error(`Attachment upload failed for question ${aq.title || aq.id}`);
            }
          } else if (!aq.attachmentFile && !aq.attachmentPath && aq.attachmentMeta) {
            finalAttachmentPath = null;
            finalAttachmentMeta = null;
          }


          return {
            question_id: aq.id,
            answer: aq.currentAnswer || "", 
            attachment_path: finalAttachmentPath,
            attachment_meta: finalAttachmentMeta,
          };
        })
      );

      const { error: rpcError } = await supabase.rpc('submit_questionnaire_answers_and_notify_admins', {
        p_questionnaire_id: questionnaireId,
        p_answers: answersWithAttachmentsProcessed,
      });

      if (rpcError) {
        console.error('Error submitting questionnaire answers via RPC:', rpcError);
        toast({ title: "Submission Failed", description: `Submission failed: ${rpcError.message}`, variant: "destructive" });
        throw rpcError;
      }
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Questionnaire submitted successfully!" });
      queryClient.invalidateQueries({ queryKey: ['latestProviderAnswers', questionnaireId, providerId] });
      queryClient.invalidateQueries({ queryKey: ['providerQuestionnaireStatus', questionnaireId, providerId] });
      queryClient.invalidateQueries({ queryKey: ['providerQuestionnairesWithStatus', providerId] }); // Invalidate list page query
      refetchProviderStatus();
      navigate('/provider/my-questionnaires');
    },
    onError: (error: Error) => {
      // Error toast is usually handled within mutationFn if it throws before the end
      // or if a specific toast is needed for a specific error condition not caught by mutationFn's try/catch
      // For a generic fallback:
      toast({ title: "Error", description: `An unexpected error occurred: ${error.message}`, variant: "destructive" });
    },
  });

  const handleSubmitAnswers = () => {
    const unansweredQuestions = answeredQuestions.filter(
      (q) => q.is_required && (!q.currentAnswer || q.currentAnswer.trim() === '')
    );

    if (unansweredQuestions.length > 0) {
      const unansweredTitles = unansweredQuestions.map(q => q.title || `Question ID: ${q.id.substring(0,6)}...`).join(', ');
      toast({ title: "Missing Answers", description: `Please answer all required questions before submitting. Missing answers for: ${unansweredTitles}.`, variant: "destructive" });
      if (expandedQuestionId !== unansweredQuestions[0].id) {
        setExpandedQuestionId(unansweredQuestions[0].id);
      }
      return;
    }
    
    const confirmMessage = providerStatus?.review_status === 'needs_clarification'
      ? "Are you sure you want to resubmit your answers? This will send them for review again."
      : "Are you sure you want to submit all answers? You will not be able to edit them after submission unless clarification is requested.";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    submitAnswersMutation.mutate();
  };
  const isLoading = isLoadingQuestionnaire || isLoadingQuestions || isLoadingSavedAnswers || isLoadingProviderStatus;
  const queryError = errorQuestionnaire || errorQuestions;

  if (isLoading) {
    return (
      <DashboardLayout title="Questionnaire">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (queryError) {
    return (
      <DashboardLayout title="Error">
        <div className="flex flex-col items-center justify-center h-64 text-destructive">
          <AlertTriangle className="h-12 w-12 mb-4" />
          <p className="text-xl">Error loading questionnaire data</p>
          <p>{queryError.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!questionnaire) {
    return (
      <DashboardLayout title="Not Found">
        <div className="text-center py-10">
          <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-xl font-semibold">Questionnaire not found.</p>
          <p className="text-sm text-muted-foreground">It might have been removed or you may not have access.</p>
        </div>
      </DashboardLayout>
    );
  }

  const canEdit = providerStatus && (
    providerStatus.status === 'pending' ||
    providerStatus.status === 'in_progress' ||
    providerStatus.status === 'needs_clarification'
  );
  const isReviewed = providerStatus?.review_status === 'reviewed';

  return (
    <DashboardLayout title={questionnaire?.name || 'Questionnaire'}>
      {providerStatus?.review_status === 'needs_clarification' && providerStatus.review_comment && (
        <Card className="mb-6 bg-orange-50 border-orange-200">
          <CardHeader>
            <CardTitle className="text-orange-700 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" /> Clarification Requested by Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-700 whitespace-pre-wrap">{providerStatus.review_comment}</p>
            <p className="text-xs text-muted-foreground mt-1">Last reviewed: {providerStatus.reviewed_at ? new Date(providerStatus.reviewed_at).toLocaleString() : 'N/A'}</p>
          </CardContent>
        </Card>
      )}
      {isReviewed && (
         <Card className="mb-6 bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-700 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2 text-green-600" /> Questionnaire Reviewed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">Score: {providerStatus?.score}/5</p>
            {providerStatus?.review_comment && <p className="text-sm mt-1">Admin Comment: {providerStatus.review_comment}</p>}
            <p className="text-xs text-muted-foreground mt-1">Reviewed on: {providerStatus?.reviewed_at ? new Date(providerStatus.reviewed_at).toLocaleString() : 'N/A'}</p>
          </CardContent>
        </Card>
      )}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">{questionnaire.name}</CardTitle>
          {questionnaire.description && <CardDescription>{questionnaire.description}</CardDescription>}
        </CardHeader>
      </Card>

      <h2 className="text-xl font-semibold mb-4">Questions</h2>
      {answeredQuestions.length > 0 ? (
        <Accordion 
            type="single" 
            collapsible 
            className="w-full space-y-2"
            value={expandedQuestionId || undefined}
            onValueChange={(value) => setExpandedQuestionId(value)}
        >
          {answeredQuestions.map((q, index) => (
            <AccordionItem value={q.id} key={q.id} className="border bg-card p-0 rounded-md">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                    <span className="font-medium text-left">{index + 1}. {q.title} {q.is_required && <span className="text-destructive ml-1">*</span>}</span>
                    {(q.lastSavedAt || q.attachmentPath) && !q.isEditing && (
                        <CheckCircle className="h-5 w-5 text-green-500 ml-2 flex-shrink-0" />
                    )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-0">
                {q.description && <p className="text-sm text-muted-foreground mb-2">{q.description}</p>}
                {providerStatus?.status === 'needs_clarification' && q.admin_clarification_request && (
                  <div className="my-2 p-3 border border-orange-300 bg-orange-50 rounded text-orange-800 text-sm shadow-sm">
                    <p className="font-semibold flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2 text-orange-600" />
                      Admin Clarification Request:
                    </p>
                    <p className="whitespace-pre-wrap mt-1 pl-1">{q.admin_clarification_request}</p>
                  </div>
                )}
                <Textarea
                  placeholder="Your Answer..."
                  value={q.currentAnswer || ''}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  rows={4}
                  readOnly={!canEdit || (!!q.savedAnswer && !q.isEditing)}
                  className="mb-3"
                />
                <div className="mb-3 space-y-2">
                  <label htmlFor={`file-upload-${q.id}`} className="text-sm font-medium text-muted-foreground">Attachment (PDF, Images, SVG):</label>
                  <Input
                    id={`file-upload-${q.id}`}
                    type="file"
                    accept=".pdf,image/*,.svg"
                    onChange={(e) => handleFileChange(q.id, e.target.files ? e.target.files[0] : null)}
                    className="text-sm"
                    disabled={!canEdit || !q.isEditing || q.isSaving || q.isUploading}
                  />
                  {q.isUploading && <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</div>}
                  {(q.attachmentFile || q.attachmentPath) && (
                    <div className="mt-2 p-2 border rounded-md bg-muted/50 text-sm flex items-center justify-between">
                      <div className="flex items-center">
                        <Paperclip className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate max-w-xs" title={q.attachmentFile?.name || q.attachmentMeta?.name || q.attachmentPath}>
                          {q.attachmentFile?.name || q.attachmentMeta?.name || q.attachmentPath?.split('/').pop()}
                        </span>
                      </div>
                      {canEdit && q.isEditing && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveAttachment(q.id)} disabled={q.isSaving || q.isUploading}>
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex justify-end items-center space-x-2">
                    {q.lastSavedAt && q.isEditing && q.currentAnswer !== q.savedAnswer && (
                       <Button variant="ghost" size="sm" onClick={() => handleCancelEdit(q.id)}>Cancel</Button>
                    )}

                    {q.isEditing || !q.savedAnswer ? (
                      <Button 
                        size="sm" 
                        onClick={() => handleSaveSingleAnswer(q.id)} 
                        disabled={q.isSaving || q.isUploading || saveSingleAnswerMutation.isPending || submitAnswersMutation.isPending}
                      >
                        {(q.isSaving || q.isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" />
                        Save Answer
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleEditAnswer(q.id)}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit Answer
                      </Button>
                    )}
                  </div>
                )}
                {(q.lastSavedAt || q.attachmentPath) && (
                    <p className="text-xs text-muted-foreground mt-2 text-right">
                        {q.lastSavedAt && `Last saved: ${new Date(q.lastSavedAt).toLocaleString()}`}
                        {q.attachmentPath && q.lastSavedAt && " | "}
                        {q.attachmentPath && `Attachment saved.`}
                    </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <p>No questions found for this questionnaire.</p>
      )}

      {answeredQuestions.length > 0 && canEdit && (
        <div className="mt-8 flex justify-end">
          <Button
            onClick={handleSubmitAnswers}
            disabled={isLoading || submitAnswersMutation.isPending || saveSingleAnswerMutation.isPending || answeredQuestions.some(q => q.isUploading || q.isSaving)}
            size="lg"
          >
            {(submitAnswersMutation.isPending || answeredQuestions.some(q => q.isUploading)) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {providerStatus?.status === 'needs_clarification' ? 'Resubmit Answers' : 'Submit All Answers'}
          </Button>
        </div>
      )}
    </DashboardLayout>
  );
};

export default QuestionnaireDetailPage;