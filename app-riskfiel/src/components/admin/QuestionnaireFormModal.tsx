import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MultiSelectChipInput, { MultiSelectOption } from '@/components/ui/MultiSelectChipInput'; // Placeholder
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Question } from '@/pages/admin/ManageQuestions';
import type { Database } from '@/integrations/supabase/types';

type QuestionnaireFromDB = Database["public"]["Tables"]["questionnaires"]["Row"];
type RpcUserResponse = Database["public"]["Functions"]["get_users_by_role"]["Returns"][number];

const questionnaireFormSchema = z.object({
  name: z.string().min(3, { message: 'Name must be at least 3 characters.' }).max(255),
  description: z.string().optional().nullable(),
  question_ids: z.array(z.string()).min(1, { message: 'Please select at least one question.' }),
  provider_ids: z.array(z.string()).min(1, { message: 'Please select at least one provider.' }),
});

type QuestionnaireFormValues = z.infer<typeof questionnaireFormSchema>;

type QuestionnaireFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  questionnaire?: QuestionnaireFromDB | null;
};

// Supabase interaction functions
const fetchQuestionsForSelect = async (): Promise<MultiSelectOption[]> => {
  const { data, error } = await supabase.from('questions').select('id, title');
  if (error) throw new Error(error.message);
  return data.map(q => ({ value: q.id, label: q.title })) || [];
};

const fetchProvidersForSelect = async (): Promise<MultiSelectOption[]> => {
  const { data, error } = await supabase.rpc('get_users_by_role', { p_role: 'provider' });
  if (error) throw new Error(error.message);
  return data?.map((p: RpcUserResponse) => ({ value: p.id, label: p.email || 'N/A' })) || [];
};

const upsertQuestionnaire = async ({ id, values }: { id?: string; values: QuestionnaireFormValues }): Promise<QuestionnaireFromDB> => {
  let questionnaireId = id;

  if (id) { // Update
    const { data: updatedData, error: updateError } = await supabase
      .from('questionnaires')
      .update({ name: values.name, description: values.description, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (updateError) throw updateError;
    if (!updatedData) throw new Error("Failed to update questionnaire details.");
    questionnaireId = updatedData.id;
  } else { // Create
    const { data: insertedData, error: insertError } = await supabase
      .from('questionnaires')
      .insert({ name: values.name, description: values.description, question_ids: [], provider_ids: [] }) // Insert with empty arrays initially
      .select()
      .single();
    if (insertError) throw insertError;
    if (!insertedData) throw new Error("Failed to create questionnaire.");
    questionnaireId = insertedData.id;
  }

  // Call RPCs to set questions and providers
  const { error: questionsError } = await supabase.rpc('set_questions_for_questionnaire', {
    p_questionnaire: questionnaireId,
    p_question_ids: values.question_ids,
  });
  if (questionsError) throw new Error(`Failed to set questions: ${questionsError.message}`);

  const { error: providersError } = await supabase.rpc('assign_questionnaire_to_providers', {
    p_questionnaire: questionnaireId,
    p_providers: values.provider_ids,
  });
  if (providersError) throw new Error(`Failed to assign providers: ${providersError.message}`);
  
  // Fetch the final state of the questionnaire
   const { data: finalData, error: finalError } = await supabase
    .from('questionnaires')
    .select('*')
    .eq('id', questionnaireId)
    .single();
  if (finalError) throw finalError;
  if (!finalData) throw new Error("Could not retrieve questionnaire after updates.");
  return finalData;
};


const QuestionnaireFormModal = ({ isOpen, onClose, questionnaire }: QuestionnaireFormModalProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: questionOptions, isLoading: isLoadingQuestions } = useQuery<MultiSelectOption[]>({
    queryKey: ['questionsForSelect'],
    queryFn: fetchQuestionsForSelect,
    enabled: isOpen, // Only fetch when modal is open
  });

  const { data: providerOptions, isLoading: isLoadingProviders } = useQuery<MultiSelectOption[]>({
    queryKey: ['providersForSelect'],
    queryFn: fetchProvidersForSelect,
    enabled: isOpen, // Only fetch when modal is open
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuestionnaireFormValues>({
    resolver: zodResolver(questionnaireFormSchema),
    defaultValues: {
      name: '',
      description: '',
      question_ids: [],
      provider_ids: [],
    }
  });

  useEffect(() => {
    if (isOpen) {
      if (questionnaire) {
        reset({
          name: questionnaire.name,
          description: questionnaire.description,
          question_ids: questionnaire.question_ids || [],
          provider_ids: questionnaire.provider_ids || [],
        });
      } else {
        reset({
          name: '',
          description: '',
          question_ids: [],
          provider_ids: [],
        });
      }
    }
  }, [questionnaire, isOpen, reset]);

  const mutation = useMutation({
    mutationFn: (values: QuestionnaireFormValues) => upsertQuestionnaire({ id: questionnaire?.id, values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast({
        title: 'Success',
        description: `Questionnaire ${questionnaire ? 'updated' : 'added'} successfully.`,
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: `Failed to ${questionnaire ? 'update' : 'add'} questionnaire: ${err.message}`,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: QuestionnaireFormValues) => {
    mutation.mutate(data);
  };

  const isLoadingOptions = isLoadingQuestions || isLoadingProviders;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{questionnaire ? 'Edit Questionnaire' : 'Add New Questionnaire'}</DialogTitle>
          <DialogDescription>
            {questionnaire ? 'Update the details of the questionnaire.' : 'Fill in the details for the new questionnaire.'}
          </DialogDescription>
        </DialogHeader>
        {isLoadingOptions ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} disabled={isSubmitting} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register('description')} disabled={isSubmitting} />
              {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
            </div>
            <div>
              <Label htmlFor="question_ids">Questions</Label>
              <Controller
                name="question_ids"
                control={control}
                render={({ field }) => (
                  <MultiSelectChipInput
                    options={questionOptions || []}
                    selectedValues={field.value}
                    onChange={field.onChange}
                    placeholder="Select questions..."
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.question_ids && <p className="text-sm text-destructive">{errors.question_ids.message}</p>}
            </div>
            <div>
              <Label htmlFor="provider_ids">Providers</Label>
              <Controller
                name="provider_ids"
                control={control}
                render={({ field }) => (
                  <MultiSelectChipInput
                    options={providerOptions || []}
                    selectedValues={field.value}
                    onChange={field.onChange}
                    placeholder="Select providers..."
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.provider_ids && <p className="text-sm text-destructive">{errors.provider_ids.message}</p>}
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting || isLoadingOptions}>
                {(isSubmitting || isLoadingOptions) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {questionnaire ? 'Save Changes' : 'Add Questionnaire'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuestionnaireFormModal;