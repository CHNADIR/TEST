import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, Paperclip, Download, Eye } from 'lucide-react'; // Ajoutez Eye
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"; // Importez les composants Dialog
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Questionnaire = Database['public']['Tables']['questionnaires']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];
type ProviderResponse = Database['public']['Tables']['provider_responses']['Row']; // Ensure this includes attachment_path and attachment_meta

interface QuestionWithAnswer extends Question {
  answer?: string | null;
  submitted_at?: string | null;
  attachment_path?: string | null;
  attachment_meta?: Record<string, any> | null; // JSONB comes as object
}

// Fonction pour récupérer les détails du questionnaire
const fetchQuestionnaireDetails = async (questionnaireId: string): Promise<Questionnaire | null> => {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('*')
    .eq('id', questionnaireId)
    .single();
  if (error) throw error;
  return data;
};

// Fonction pour récupérer les questions par IDs
const fetchQuestionsByIds = async (questionIds: string[]): Promise<Question[]> => {
  if (!questionIds || questionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('id', questionIds);
  if (error) throw error;
  return data || [];
};

// Fonction pour récupérer les dernières réponses d'un fournisseur pour un questionnaire
const fetchProviderLatestResponsesForQuestionnaire = async (
  questionnaireId: string,
  providerId: string
): Promise<ProviderResponse[]> => {
  const { data, error } = await supabase
    .from('provider_responses')
    .select('*')
    .eq('questionnaire_id', questionnaireId)
    .eq('provider_id', providerId)
    .order('submitted_at', { ascending: false }); // Pourrait être groupé par question_id pour obtenir la dernière

  // Pour obtenir la *dernière* réponse pour chaque question par ce fournisseur
  // Cela peut être fait plus efficacement avec une fonction RPC ou une vue si nécessaire.
  // Pour l'instant, nous allons récupérer toutes les réponses et les traiter côté client ou afficher la dernière.
  // Alternativement, utiliser la fonction RPC `get_provider_latest_answers` si elle est adaptée.

  if (error) {
    console.error('Error fetching provider responses:', error);
    throw error;
  }
  return data || [];
};


const AdminQuestionnaireResponsesPage = () => {
  const { questionnaireId, providerId } = useParams<{ questionnaireId: string; providerId: string }>();
  const location = useLocation();
  const [questionsWithAnswers, setQuestionsWithAnswers] = useState<QuestionWithAnswer[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedUrlsLoading, setSignedUrlsLoading] = useState<Record<string, boolean>>({});

  // Nouveaux états pour la modale d'aperçu
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; type?: string | null; name?: string | null } | null>(null);

  const {
    data: questionnaire,
    isLoading: isLoadingQuestionnaire,
    error: errorQuestionnaire,
  } = useQuery<Questionnaire | null, Error, Questionnaire | null, readonly (string | undefined)[]>({
    queryKey: ['questionnaireDetails', questionnaireId],
    queryFn: () => {
      if (!questionnaireId) return Promise.resolve(null);
      return fetchQuestionnaireDetails(questionnaireId);
    },
    enabled: !!questionnaireId,
  });

  const {
    data: questions,
    isLoading: isLoadingQuestions,
    error: errorQuestions,
  } = useQuery<Question[], Error, Question[], readonly (string | string[] | undefined)[]>({
    queryKey: ['questionnaireQuestions', questionnaire?.id, questionnaire?.question_ids],
    queryFn: () => {
      if (!questionnaire || !questionnaire.question_ids || questionnaire.question_ids.length === 0) {
        return Promise.resolve([]);
      }
      return fetchQuestionsByIds(questionnaire.question_ids);
    },
    enabled: !!questionnaire && !!questionnaire.question_ids && questionnaire.question_ids.length > 0,
  });

  const {
    data: providerResponses,
    isLoading: isLoadingResponses,
    error: errorResponses,
  } = useQuery<ProviderResponse[], Error, ProviderResponse[], readonly (string | undefined)[]>({
    queryKey: ['providerResponses', questionnaireId, providerId],
    queryFn: () => {
      if (!questionnaireId || !providerId) return Promise.resolve([]);
      return fetchProviderLatestResponsesForQuestionnaire(questionnaireId, providerId);
    },
    enabled: !!questionnaireId && !!providerId && !!questions,
  });
  
  // Pour extraire le provider_email de la notification (si passé via state)
  const notificationBody = location.state?.notificationBody as string | undefined;
  let providerEmailFromNotification: string | null = null;
  if (notificationBody) {
    const match = notificationBody.match(/Provider (.*?) has submitted/);
    if (match && match[1]) {
      providerEmailFromNotification = match[1];
    }
  }


  useEffect(() => {
    if (questions && providerResponses) {
      const combined = questions.map(q => {
        // Trouver la dernière réponse pour cette question par ce fournisseur
        const latestResponse = providerResponses
          .filter(r => r.question_id === q.id)
          .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0];
        
        return {
          ...q,
          answer: latestResponse?.answer,
          submitted_at: latestResponse?.submitted_at,
          attachment_path: latestResponse?.attachment_path,
          attachment_meta: latestResponse?.attachment_meta as Record<string, any> | null,
        };
      });
      setQuestionsWithAnswers(combined);
    } else if (questions) {
        setQuestionsWithAnswers(questions.map(q => ({...q, answer: null, submitted_at: null, attachment_path: null, attachment_meta: null })));
    }
  }, [questions, providerResponses]);

  const getSignedUrl = async (path: string) => {
    if (signedUrls[path] || signedUrlsLoading[path]) return;

    setSignedUrlsLoading(prev => ({ ...prev, [path]: true }));
    try {
      const { data, error } = await supabase.storage
        .from('questionnaire-attachments')
        .createSignedUrl(path, 3600); // Signed URL valid for 1 hour
      if (error) throw error;
      if (data) {
        setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }));
      }
    } catch (error) {
      console.error('Error creating signed URL:', error);
      toast.error("Could not load attachment preview.");
    } finally {
      setSignedUrlsLoading(prev => ({ ...prev, [path]: false }));
    }
  };

  useEffect(() => {
    questionsWithAnswers.forEach(qwa => {
      if (qwa.attachment_path && !signedUrls[qwa.attachment_path] && !signedUrlsLoading[qwa.attachment_path]) {
        getSignedUrl(qwa.attachment_path);
      }
    });
  }, [questionsWithAnswers]); // Removed signedUrls, signedUrlsLoading to avoid loop, manage loading state inside getSignedUrl

  const isLoading = isLoadingQuestionnaire || isLoadingQuestions || isLoadingResponses;
  const queryError = errorQuestionnaire || errorQuestions || errorResponses;

  if (isLoading) {
    return (
      <DashboardLayout title="Loading Responses...">
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
          <p className="text-xl">Error loading data</p>
          <p>{queryError.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!questionnaire) {
    return (
      <DashboardLayout title="Not Found">
        <div className="text-center py-10">
          <p className="text-xl font-semibold">Questionnaire not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Responses for: ${questionnaire?.name || 'Questionnaire'}`}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{questionnaire.name}</CardTitle>
            {questionnaire.description && (
              <CardDescription>{questionnaire.description}</CardDescription>
            )}
             {providerEmailFromNotification && (
              <CardDescription className="pt-2">
                Submitted by: <strong>{providerEmailFromNotification}</strong>
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        <h2 className="text-xl font-semibold mt-6">Questions and Answers</h2>
        {questionsWithAnswers.length > 0 ? (
          <div className="space-y-4">
            {questionsWithAnswers.map((q) => (
              <Card key={q.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{q.title}</CardTitle>
                  {q.description && (
                     <CardDescription>{q.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="p-4 border bg-muted/30 rounded-md space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Provider's Answer:</p>
                      <p className="text-sm whitespace-pre-wrap">
                        {q.answer || <span className="italic text-muted-foreground">No answer provided</span>}
                      </p>
                      {q.submitted_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                              Submitted on: {new Date(q.submitted_at).toLocaleString()}
                          </p>
                      )}
                    </div>

                    {q.attachment_path && (
                      <div>
                        <div className="flex items-center mb-2"> {/* Flex container for label and action buttons */}
                          <p className="text-sm font-semibold mr-2">Attachment:</p>
                          {signedUrls[q.attachment_path] && (
                            <>
                              {/* Bouton Aperçu (Oeil) */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (signedUrls[q.attachment_path]) {
                                    setPreviewFile({
                                      url: signedUrls[q.attachment_path],
                                      type: q.attachment_meta?.type,
                                      name: q.attachment_meta?.name || q.attachment_path?.split('/').pop()
                                    });
                                    setIsPreviewModalOpen(true);
                                  } else {
                                    toast.error("Attachment URL not ready. Please wait or try reloading.");
                                  }
                                }}
                                title="Preview attachment"
                                className="h-7 w-7 mr-1" // Ajout de mr-1 pour espacement
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {/* Bouton Télécharger (Download) */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  if (!signedUrls[q.attachment_path]) {
                                    toast.error("Attachment URL not ready yet.");
                                    return;
                                  }
                                  const link = document.createElement('a');
                                  link.href = signedUrls[q.attachment_path];
                                  link.setAttribute('download', q.attachment_meta?.name || q.attachment_path.split('/').pop() || 'download');
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  toast.success("Attachment download started.");
                                }}
                                title="Download attachment"
                                className="h-7 w-7"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Indicateur de chargement pour l'URL signée */}
                        {signedUrlsLoading[q.attachment_path] && <Loader2 className="h-4 w-4 animate-spin my-2" />}
                        
                        {/* Aperçu inline ou bouton "View" pour les non-images */}
                        {signedUrls[q.attachment_path] && (
                          <div className="mt-1">
                            {q.attachment_meta?.type?.startsWith('image/') ? (
                              <img 
                                src={signedUrls[q.attachment_path]} 
                                alt={q.attachment_meta?.name || 'Attachment preview'} 
                                className="max-w-xs max-h-48 border rounded cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => { // Permet aussi de cliquer sur l'image pour l'agrandir
                                    setPreviewFile({
                                      url: signedUrls[q.attachment_path],
                                      type: q.attachment_meta?.type,
                                      name: q.attachment_meta?.name || q.attachment_path?.split('/').pop()
                                    });
                                    setIsPreviewModalOpen(true);
                                }}
                              />
                            ) : (
                              <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                                <a href={signedUrls[q.attachment_path]} target="_blank" rel="noopener noreferrer">
                                  <Paperclip className="h-4 w-4 mr-2" />
                                  View {q.attachment_meta?.name || q.attachment_path.split('/').pop()}
                                </a>
                              </Button>
                            )}
                          </div>
                        )}
                        {/* Bouton pour charger l'URL signée si elle n'est pas encore chargée */}
                        {!signedUrls[q.attachment_path] && !signedUrlsLoading[q.attachment_path] && (
                           <Button variant="link" size="sm" onClick={() => getSignedUrl(q.attachment_path!)} className="p-0 h-auto mt-1">
                             Load attachment
                           </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p>No questions or answers found for this submission.</p>
        )}
      </div>

      {/* Boîte de dialogue modale pour l'aperçu de la pièce jointe */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[80vw] lg:max-w-[70vw] xl:max-w-[60vw] w-auto h-[90vh] flex flex-col p-4">
          <DialogHeader>
            <DialogTitle className="truncate">Preview: {previewFile?.name || 'Attachment'}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-auto my-4">
            {previewFile?.url && (
              previewFile.type?.startsWith('image/') ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.name || 'Preview'} 
                  className="max-w-full max-h-full object-contain mx-auto" 
                />
              ) : previewFile.type === 'application/pdf' ? (
                <iframe 
                  src={previewFile.url} 
                  title={previewFile.name || 'PDF Preview'} 
                  className="w-full h-full border-0" 
                />
              ) : (
                <div className="text-center p-6">
                  <p className="mb-4">Preview not available for this file type.</p>
                  <Button asChild>
                    <a href={previewFile.url} target="_blank" rel="noopener noreferrer" download={previewFile.name}>
                      <Download className="mr-2 h-4 w-4" /> Download file
                    </a>
                  </Button>
                </div>
              )
            )}
          </div>
          <DialogFooter className="sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default AdminQuestionnaireResponsesPage;
