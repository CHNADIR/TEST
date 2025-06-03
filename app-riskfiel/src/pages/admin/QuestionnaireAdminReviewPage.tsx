import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, Paperclip, Download, Eye, Star, Send, MessageSquare, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Database, Json } from '@/integrations/supabase/types'; // Assurez-vous que Json est exporté depuis types.ts si nécessaire
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { XCircle } from 'lucide-react';

type Questionnaire = Database['public']['Tables']['questionnaires']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];
type ProviderResponse = Database['public']['Tables']['provider_responses']['Row'] & { admin_score?: number | null; admin_remark?: string | null }; // Étendre pour inclure les champs admin
type ProviderQuestionnaireStatus = Database['public']['Tables']['provider_questionnaire_status']['Row'];

interface QuestionWithAnswer extends Question {
  answer?: string | null;
  submitted_at?: string | null;
  attachment_path?: string | null;
  attachment_meta?: Record<string, any> | null;
  admin_score?: number | null; // Pour afficher les scores existants
  admin_remark?: string | null; // Pour afficher les remarques existantes
}

interface IndividualReview {
  question_id: string;
  score: number;
  remark?: string;
}

const fetchQuestionnaireDetails = async (questionnaireId: string): Promise<Questionnaire | null> => {
  const { data, error } = await supabase.from('questionnaires').select('*').eq('id', questionnaireId).single();
  if (error) throw error;
  return data;
};

const fetchQuestionsByIds = async (questionIds: string[]): Promise<Question[]> => {
  if (!questionIds || questionIds.length === 0) return [];
  const { data, error } = await supabase.from('questions').select('*').in('id', questionIds);
  if (error) throw error;
  return data || [];
};

// Modifié pour récupérer les provider_responses avec admin_score et admin_remark
const fetchProviderLatestResponsesForQuestionnaire = async (questionnaireId: string, providerId: string): Promise<ProviderResponse[]> => {
  // Si votre RPC 'get_provider_latest_answers_for_questionnaire' ne retourne pas admin_score/admin_remark,
  // vous devrez faire une requête directe à la table provider_responses
  // ou modifier la RPC. Pour l'instant, on suppose qu'elle les retourne ou qu'on les fusionnera.
  
  // Exemple avec une requête directe si RPC n'est pas à jour :
  const { data, error } = await supabase
    .from('provider_responses')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .eq('provider_id', providerId)
    // Ajoutez une logique pour obtenir la "dernière" réponse si nécessaire (par ex. order by submitted_at desc, limit 1 par question_id)
    // Pour simplifier, on prend toutes les réponses pour ce questionnaire/provider.
    // La logique de 'get_provider_latest_answers_for_questionnaire' est supposée gérer cela.
    // Si vous utilisez la RPC, assurez-vous qu'elle sélectionne admin_score et admin_remark.

  // Pour l'instant, utilisons la RPC et supposons qu'elle est correcte ou sera adaptée
  const rpcResult = await supabase.rpc('get_provider_latest_answers_for_questionnaire', {
    p_questionnaire_id: questionnaireId,
    p_provider_id: providerId,
  });

  if (rpcResult.error) throw rpcResult.error;
  return (rpcResult.data as ProviderResponse[]) || [];
};

const fetchProviderQuestionnaireStatus = async (questionnaireId: string, providerId: string): Promise<ProviderQuestionnaireStatus | null> => {
  const { data, error } = await supabase
    .from('provider_questionnaire_status')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .eq('provider_id', providerId)
    .limit(1);

  if (error) {
    console.error('Error fetching provider questionnaire status:', error.message);
    throw error;
  }
  return (data && data.length > 0) ? data[0] : null;
};

const StarRating = ({ score, setScore, disabled, starCount = 5 }: { score: number, setScore: (score: number) => void, disabled?: boolean, starCount?: number }) => {
  return (
    <div className="flex space-x-1">
      {Array.from({ length: starCount + 1 }, (_, i) => i).map((starValue) => ( // Pour 0-5 étoiles
        <span key={starValue} title={`${starValue} star${starValue !== 1 ? 's' : ''}`}>
          <Star
            className={`h-8 w-8 cursor-pointer ${starValue <= score && score > 0 ? 'text-yellow-400 fill-yellow-400' : (starValue === 0 && score === 0 ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300') } ${starValue === 0 ? 'mr-1' : ''}`}
            onClick={() => !disabled && setScore(starValue)}
          />
        </span>
      ))}
    </div>
  );
};

const QuestionnaireAdminReviewPage = () => {
  const { questionnaireId, providerId } = useParams<{ questionnaireId: string; providerId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const questionnaireNameFromState = location.state?.questionnaireName;
  const providerEmailFromState = location.state?.providerEmail;

  const [questionsWithAnswers, setQuestionsWithAnswers] = useState<QuestionWithAnswer[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedUrlsLoading, setSignedUrlsLoading] = useState<Record<string, boolean>>({});
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; type?: string | null; name?: string | null } | null>(null);

  const [individualScores, setIndividualScores] = useState<Record<string, number>>({});
  const [individualRemarks, setIndividualRemarks] = useState<Record<string, string>>({}); // Pour les remarques internes de l'admin
  const [globalReviewComment, setGlobalReviewComment] = useState('');

  // NOUVEAUX ÉTATS
  type ClarityStatus = 'clear' | 'not_clear' | 'pending'; // 'pending' ou undefined pour l'état initial
  const [clarityStatuses, setClarityStatuses] = useState<Record<string, ClarityStatus>>({});
  const [clarificationRequests, setClarificationRequests] = useState<Record<string, string>>({}); // Demandes de précision par question

  const { data: questionnaireInfo, isLoading: isLoadingQuestionnaire } = useQuery({
    queryKey: ['questionnaireDetails', questionnaireId],
    queryFn: () => questionnaireId ? fetchQuestionnaireDetails(questionnaireId) : Promise.resolve(null),
    enabled: !!questionnaireId,
  });

  const { data: questions, isLoading: isLoadingQuestions } = useQuery({
    queryKey: ['questionnaireQuestions', questionnaireInfo?.id, questionnaireInfo?.question_ids],
    queryFn: () => (questionnaireInfo?.question_ids && questionnaireInfo.question_ids.length > 0) ? fetchQuestionsByIds(questionnaireInfo.question_ids) : Promise.resolve([]),
    enabled: !!questionnaireInfo && !!questionnaireInfo.question_ids,
  });
  
  const { data: providerResponses, isLoading: isLoadingResponses } = useQuery({
    queryKey: ['providerResponsesForReview', questionnaireId, providerId],
    queryFn: () => (questionnaireId && providerId) ? fetchProviderLatestResponsesForQuestionnaire(questionnaireId, providerId) : Promise.resolve([]),
    enabled: !!questionnaireId && !!providerId && !!questions, // S'assurer que 'questions' est chargé
  });
  
  const { data: providerStatus, isLoading: isLoadingStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['providerQuestionnaireStatusForReview', questionnaireId, providerId],
    queryFn: () => (questionnaireId && providerId) ? fetchProviderQuestionnaireStatus(questionnaireId, providerId) : Promise.resolve(null),
    enabled: !!questionnaireId && !!providerId,
  });

  useEffect(() => {
    if (questions && providerResponses) {
      const combined = questions.map(q => {
        const resp = providerResponses.find(r => r.question_id === q.id);
        return { 
          ...q, 
          answer: resp?.answer, 
          submitted_at: resp?.submitted_at, 
          attachment_path: resp?.attachment_path, 
          attachment_meta: resp?.attachment_meta as Record<string, any> | null,
          admin_score: resp?.admin_score, // S'assurer que ces champs sont bien dans ProviderResponse
          admin_remark: resp?.admin_remark 
        };
      }).sort((a, b) => {
        const indexA = questionnaireInfo?.question_ids?.indexOf(a.id) ?? -1;
        const indexB = questionnaireInfo?.question_ids?.indexOf(b.id) ?? -1;
        return indexA - indexB;
      });
      setQuestionsWithAnswers(combined);

      // Initialiser les états
      const initialScores: Record<string, number> = {};
      const initialAdminRemarks: Record<string, string> = {};
      const initialClarity: Record<string, ClarityStatus> = {};
      const initialClarificationRequests: Record<string, string> = {};

      if (providerStatus?.review_status === 'reviewed') { // Si l'ensemble est déjà revu
        combined.forEach(item => {
          if (item.id) { // item.id est l'ID de la question
            if (item.admin_score !== null && item.admin_score !== undefined) {
              initialScores[item.id] = item.admin_score;
              initialClarity[item.id] = 'clear'; // Si score existe, on suppose que c'était clair
            } else {
              // Si pas de score mais le questionnaire est 'reviewed', difficile de deviner la clarté sans plus d'info en BDD
              // On pourrait laisser 'pending' ou supposer 'clear' si aucune action de clarification n'a été faite pour cette question
              initialClarity[item.id] = 'pending'; // Ou une autre logique
            }
            if (item.admin_remark) {
              initialAdminRemarks[item.id] = item.admin_remark;
            }
          }
        });
        if (providerStatus?.review_comment) {
          setGlobalReviewComment(providerStatus.review_comment);
        }
      } else if (providerStatus?.review_status === 'needs_clarification') {
        // Si le statut global est 'needs_clarification', on pourrait pré-remplir les demandes
        // Mais cela nécessite que les demandes de clarification soient stockées par question en BDD.
        // Pour l'instant, on initialise comme si c'était une nouvelle revue.
        combined.forEach(item => {
          if (item.id) initialClarity[item.id] = 'pending';
        });
      } else { // 'pending' ou autre
        combined.forEach(item => {
          if (item.id) initialClarity[item.id] = 'pending';
        });
      }
      setIndividualScores(initialScores);
      setIndividualRemarks(initialAdminRemarks);
      setClarityStatuses(initialClarity);
      setClarificationRequests(initialClarificationRequests);
      
      // Si le statut global est 'needs_clarification' et qu'il y a un commentaire global, l'afficher
      if (providerStatus?.review_status === 'needs_clarification' && providerStatus.review_comment) {
        setGlobalReviewComment(providerStatus.review_comment);
      } else if (providerStatus?.review_status !== 'reviewed') { // Effacer si ce n'est pas une revue existante
         setGlobalReviewComment('');
      }


    }
  }, [questions, providerResponses, questionnaireInfo?.question_ids, providerStatus]);


  const getSignedUrl = async (path: string) => {
    if (signedUrls[path] || signedUrlsLoading[path]) return;
    setSignedUrlsLoading(prev => ({ ...prev, [path]: true }));
    try {
      const { data, error: urlError } = await supabase.storage.from('questionnaire-attachments').createSignedUrl(path, 3600);
      if (urlError) throw urlError;
      if (data) {
        setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
      }
    } catch (error) {
      console.error('Error fetching signed URL:', error);
    } finally {
      setSignedUrlsLoading(prev => ({ ...prev, [path]: false }));
    }
  };

  const handlePreview = (file: { url: string; type?: string | null; name?: string | null }) => {
    setPreviewFile(file);
    setIsPreviewModalOpen(true);
  };

  const closePreviewModal = () => {
    setIsPreviewModalOpen(false);
    setPreviewFile(null);
  };

  // REMPLACER la fonction handleSubmitReview actuelle par l'utilisation de cette mutation
  const finalizeReviewMutation = useMutation({
    mutationFn: async (data: {
      reviews: Array<{
        question_id: string;
        clarity_status: ClarityStatus; // 'clear', 'not_clear'
        score?: number; 
        admin_remark?: string; 
        clarification_request?: string; 
      }>;
      global_comment?: string;
    }) => {
      if (!questionnaireId || !providerId) throw new Error("Questionnaire ID or Provider ID is missing.");
      
      const { error: rpcError } = await supabase.rpc('admin_finalize_detailed_review', { 
        p_questionnaire_id: questionnaireId, 
        p_provider_id: providerId, 
        p_detailed_reviews: data.reviews as unknown as Json, // Assurez-vous que le type Json est compatible
        p_global_questionnaire_comment: data.global_comment || '' 
      });

      if (rpcError) {
        console.error('RPC Error admin_finalize_detailed_review:', rpcError);
        throw new Error(rpcError.message || 'Failed to finalize review via RPC.');
      }
    },
    onSuccess: () => {
      toast.success("Review finalized and submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ['providerResponsesForReview', questionnaireId, providerId] });
      queryClient.invalidateQueries({ queryKey: ['providerQuestionnaireStatusForReview', questionnaireId, providerId] });
      queryClient.invalidateQueries({ queryKey: ['submittedQuestionnairesForAdmin'] }); // Pour rafraîchir les listes admin
      queryClient.invalidateQueries({ queryKey: ['assignedQuestionnairesOverviewForAdmin'] });
      refetchStatus(); // Pour mettre à jour l'état local de la page
      // navigate('/admin/review-submissions'); // Optionnel: rediriger
    },
    onError: (error: Error) => {
      toast.error(`Finalizing review failed: ${error.message}`);
    },
  });

  const handleFinalizeReview = () => { // Cette fonction sera appelée par le bouton "Submit Review"
    const detailedReviews = questionsWithAnswers.map(q => {
      const clarity = clarityStatuses[q.id];

      if (!clarity || clarity === 'pending') {
        toast.error(`Please assess the clarity for question: "${q.title || `Question ${q.id.substring(0,8)}...`}"`);
        throw new Error("Clarity not assessed for all questions.");
      }
      if (clarity === 'clear' && (individualScores[q.id] === undefined || individualScores[q.id]! < 1 || individualScores[q.id]! > 5)) {
        toast.error(`Please provide a valid score (1-5) for clear answer: "${q.title || `Question ${q.id.substring(0,8)}...`}"`);
        throw new Error("Invalid score for clear answer.");
      }
      if (clarity === 'not_clear' && (!clarificationRequests[q.id] || clarificationRequests[q.id]!.trim() === '')) {
        toast.error(`Please provide a clarification request for unclear answer: "${q.title || `Question ${q.id.substring(0,8)}...`}"`);
        throw new Error("Missing clarification request.");
      }

      return {
        question_id: q.id,
        clarity_status: clarity,
        score: clarity === 'clear' ? (individualScores[q.id]) : undefined,
        admin_remark: clarity === 'clear' ? (individualRemarks[q.id] || '') : undefined,
        clarification_request: clarity === 'not_clear' ? (clarificationRequests[q.id] || '') : undefined,
      };
    });

    try {
      // La validation ci-dessus va throw une erreur et empêcher la mutation si invalide
      finalizeReviewMutation.mutate({
        reviews: detailedReviews,
        global_comment: globalReviewComment,
      });
    } catch (e: any) {
      // L'erreur (toast) est déjà gérée dans la boucle map ou les vérifications si une condition n'est pas remplie
      console.error("Validation failed before mutation:", e.message);
      // Pas besoin de toast ici si déjà fait, sauf si c'est une erreur non prévue
    }
  };
  
  // Assurez-vous que isProcessing utilise la bonne mutation
  const isProcessing = finalizeReviewMutation.isPending || isLoadingResponses || isLoadingStatus || isLoadingQuestionnaire;

  // Déplacer isAdminActionPending ici pour qu'il soit accessible globalement dans le JSX du composant
  const isAdminActionPending = providerStatus?.review_status !== 'reviewed' && providerStatus?.status === 'submitted';


  // Définir pageTitle pour l'utiliser dans DashboardLayout et ailleurs
  const pageTitle = questionnaireNameFromState || questionnaireInfo?.name || "Review Questionnaire";

  // Gestionnaire de téléchargement de fichier simple
  const triggerDownload = (url: string, filename?: string | null) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) {
      link.download = filename;
    } else {
      link.download = url.substring(url.lastIndexOf('/') + 1);
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <DashboardLayout title={pageTitle}>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8"> {/* Ajout de padding pour un meilleur espacement */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            {providerEmailFromState && <p className="text-sm text-gray-500">Provider: {providerEmailFromState}</p>}
            {questionnaireInfo && !questionnaireNameFromState && <p className="text-sm text-gray-500">{questionnaireInfo.description}</p>}
          </div>
          <Button onClick={() => navigate(-1)} variant="outline" size="sm">
            <XCircle className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>

        {isProcessing && (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin h-6 w-6 text-primary" />
          </div>
        )}

        {!isProcessing && questionsWithAnswers.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">No questions found for this questionnaire.</p>
          </div>
        )}

        {questionsWithAnswers.map((q, index) => {
          // isAdminActionPending est maintenant défini plus haut
          const currentReviewStatus = providerStatus?.review_status;
          return (
            <Card key={q.id} className="mb-4">
              <CardHeader>
                <div className="flex justify-between items-center">
                  {/* Utilisation de q.title ici aussi pour la cohérence si c'est le champ principal du texte de la question */}
                  <CardTitle className="text-lg font-semibold">{`${index + 1}. ${q.title}`}</CardTitle>
                  {q.attachment_path && (
                    <Button
                      variant="link"
                      size="icon"
                      onClick={() => {
                        if (signedUrls[q.attachment_path!]) {
                          handlePreview({ url: signedUrls[q.attachment_path!], name: q.attachment_meta?.name, type: q.attachment_meta?.type });
                        } else {
                          getSignedUrl(q.attachment_path!);
                        }
                      }}
                      disabled={signedUrlsLoading[q.attachment_path!]}
                      title={signedUrls[q.attachment_path!] ? "Preview Attachment" : "Load Attachment"}
                    >
                      {signedUrlsLoading[q.attachment_path!] ? <Loader2 className="w-5 h-5 animate-spin" /> : (signedUrls[q.attachment_path!] ? <Eye className="w-5 h-5 text-primary" /> : <Paperclip className="w-5 h-5 text-gray-400" />)}
                    </Button>
                  )}
                </div>
                {/* Correction: Utiliser q.title ou q.description si disponible, au lieu de q.question_text */}
                <CardDescription className="mt-1 text-sm text-gray-600">{q.description || q.title}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Affichage de la réponse du provider (si disponible) */}
                {q.answer && (
                  <div className="mb-4">
                    <Label className="block text-sm font-medium mb-1">Provider's Answer:</Label>
                    <div className="p-3 border rounded-md bg-gray-50">
                      <p className="text-sm whitespace-pre-wrap">{q.answer}</p>
                    </div>
                  </div>
                )}

                {/* Section de revue par question pour l'admin */}
                {isAdminActionPending && (
                  <div className="mt-4 pt-4 border-t">
                    <Label className="text-base font-semibold block mb-2">Assess Answer Clarity:</Label>
                    <div className="flex items-center space-x-4 mb-3">
                      {(['clear', 'not_clear'] as ClarityStatus[]).map(statusOption => (
                        <div key={statusOption} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`clarity-${q.id}-${statusOption}`}
                            name={`clarity-${q.id}`}
                            value={statusOption}
                            checked={clarityStatuses[q.id] === statusOption}
                            onChange={(e) => {
                              setClarityStatuses(prev => ({ ...prev, [q.id]: e.target.value as ClarityStatus }));
                              // Réinitialiser le score ou la demande de clarification si on change d'avis
                              if (e.target.value === 'clear') {
                                setClarificationRequests(prev => ({...prev, [q.id]: ''}));
                              } else {
                                setIndividualScores(prev => ({...prev, [q.id]: 0})); // ou undefined
                                setIndividualRemarks(prev => ({...prev, [q.id]: ''}));
                              }
                            }}
                            disabled={isProcessing}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                          />
                          <Label htmlFor={`clarity-${q.id}-${statusOption}`} className="capitalize">
                            {statusOption === 'clear' ? 'Answer is Clear' : 'Needs Clarification'}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {clarityStatuses[q.id] === 'clear' && (
                      <>
                        <Label htmlFor={`score-${q.id}`} className="text-base font-semibold block mb-1">Score (1-5 stars):</Label>
                        <StarRating 
                          score={individualScores[q.id] ?? 0}
                          setScore={(s) => setIndividualScores(prev => ({ ...prev, [q.id]: s }))} 
                          disabled={isProcessing}
                          starCount={5}
                        />
                        <Label htmlFor={`remark-${q.id}`} className="text-base font-semibold block mt-3 mb-1">Admin's Internal Remark (Optional):</Label>
                        <Textarea
                          id={`remark-${q.id}`}
                          value={individualRemarks[q.id] || ''}
                          onChange={(e) => setIndividualRemarks(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Internal note for this answer (not visible to provider)..."
                          rows={2}
                          disabled={isProcessing}
                        />
                      </>
                    )}

                    {clarityStatuses[q.id] === 'not_clear' && (
                      <>
                        <Label htmlFor={`clarification-${q.id}`} className="text-base font-semibold block mb-1">Request for Clarification (Visible to Provider):</Label>
                        <Textarea
                          id={`clarification-${q.id}`}
                          value={clarificationRequests[q.id] || ''}
                          onChange={(e) => setClarificationRequests(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Specify what needs to be clarified for this answer..."
                          rows={3}
                          disabled={isProcessing}
                        />
                      </>
                    )}
                  </div>
                )}
                {/* Affichage des infos si déjà revu (à adapter) */}
                {currentReviewStatus === 'reviewed' && (
                  <div className="mt-3 pt-3 border-t border-dashed">
                    <p className="text-sm font-semibold">Admin Review for this answer:</p>
                    {q.admin_score !== null && q.admin_score !== undefined ? (
                      <>
                        <p className="text-sm">Clarity: Clear</p>
                        <p className="text-sm">Score: {q.admin_score}/5</p>
                        {q.admin_remark && (
                          <p className="text-sm mt-1">Internal Remark: <span className="italic whitespace-pre-wrap">{q.admin_remark}</span></p>
                        )}
                      </>
                    ) : (
                      // Ici, il faudrait savoir si une clarification avait été demandée pour CETTE question spécifiquement
                      // Cela nécessite des changements en BDD. Pour l'instant, on ne peut pas l'afficher précisément.
                      <p className="text-sm">Status: (Details not available for individual past clarifications)</p>
                    )}
                  </div>
                )}
                 {currentReviewStatus === 'needs_clarification' && providerStatus?.review_comment && (
                    // Afficher ici la demande de clarification spécifique à la question si elle était stockée
                    // Pour l'instant, on ne peut afficher que le commentaire global
                    <></>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Section de commentaire global pour l'admin */}
        {isAdminActionPending && (
          <div className="mt-6">
            <Label className="text-base font-semibold block mb-2">Global Review Comment:</Label>
            <Textarea
              value={globalReviewComment}
              onChange={(e) => setGlobalReviewComment(e.target.value)}
              placeholder="Optional: Provide your comments about the overall questionnaire..."
              rows={3}
            />
          </div>
        )}

        {/* Actions finales */}
        {isAdminActionPending && (
          <div className="mt-8 flex justify-end space-x-4">
            <Button variant="outline" onClick={() => navigate(-1)} disabled={isProcessing}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleFinalizeReview} disabled={isProcessing} className="flex items-center">
              {isProcessing && <Loader2 className="animate-spin h-5 w-5 mr-2" />}
              Submit Review
            </Button>
          </div>
        )}
      </div>

      {/* Modal de prévisualisation des fichiers */}
      <Dialog open={isPreviewModalOpen} onOpenChange={closePreviewModal}>
        <DialogContent className="max-w-2xl mx-auto p-4">
          {previewFile && (
            <div className="flex flex-col items-center">
              {previewFile.type?.startsWith('image/') ? (
                <img src={previewFile.url} alt={previewFile.name || 'Preview'} className="max-h-[80vh] w-auto rounded-md shadow-md object-contain" />
              ) : previewFile.type === 'application/pdf' && previewFile.url ? (
                <iframe src={previewFile.url} title={previewFile.name || 'PDF Preview'} className="w-full h-[80vh]" frameBorder="0" />
              ) : (
                <div className="p-4 border rounded-md bg-gray-50 text-center">
                  <p className="text-sm text-gray-500 mb-2">Cannot preview this file type directly.</p>
                  <p className="text-sm font-medium">{previewFile.name}</p>
                  <div className="flex justify-center mt-2 space-x-2">
                    <Button variant="link" size="sm" onClick={() => window.open(previewFile.url, '_blank')}>
                      <Eye className="w-4 h-4 mr-1" />
                      View File
                    </Button>
                    {/* Correction pour le téléchargement */}
                    <Button variant="link" size="sm" onClick={() => triggerDownload(previewFile.url, previewFile.name)}>
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default QuestionnaireAdminReviewPage;