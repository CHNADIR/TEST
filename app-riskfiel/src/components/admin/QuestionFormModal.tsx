import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Question } from '@/pages/admin/ManageQuestions'; // Import the type

const questionFormSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }).max(255),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
});

type QuestionFormValues = z.infer<typeof questionFormSchema>;

type QuestionFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  question?: Question | null; // For editing
};

// Supabase interaction functions for add/update
const addQuestion = async (values: QuestionFormValues): Promise<Question> => {
  const questionToInsert = {
    title: values.title, // Assurez-vous que title est bien passé
    description: values.description,
    category: values.category,
    updated_at: new Date().toISOString(),
    // created_at sera géré par la base de données si vous avez un DEFAULT NOW()
  };

  const { data, error } = await supabase
    .from('questions')
    .insert([questionToInsert]) // Passer l'objet explicitement construit
    .select()
    .single();

  if (error) {
    console.error("Error inserting question:", error);
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No data returned after inserting question");
  }
  return data;
};

const updateQuestion = async ({ id, ...values }: QuestionFormValues & { id: string }): Promise<Question> => {
  const questionToUpdate = {
    title: values.title,
    description: values.description,
    category: values.category,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('questions')
    .update(questionToUpdate)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error updating question:", error);
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("No data returned after updating question");
  }
  return data;
};


const QuestionFormModal = ({ isOpen, onClose, question }: QuestionFormModalProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema),
  });

  useEffect(() => {
    if (question) {
      reset({
        title: question.title,
        description: question.description,
        category: question.category,
      });
    } else {
      reset({
        title: '',
        description: '',
        category: '',
      });
    }
  }, [question, isOpen, reset]);

  const mutation = useMutation({
    mutationFn: (values: QuestionFormValues) => {
      if (question?.id) {
        return updateQuestion({ ...values, id: question.id });
      }
      return addQuestion(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast({
        title: 'Success',
        description: `Question ${question ? 'updated' : 'added'} successfully.`,
        variant: 'default',
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: `Failed to ${question ? 'update' : 'add'} question: ${err.message}`,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: QuestionFormValues) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{question ? 'Edit Question' : 'Add New Question'}</DialogTitle>
          <DialogDescription>
            {question ? 'Update the details of the question.' : 'Fill in the details for the new question.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register('title')} disabled={isSubmitting} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} disabled={isSubmitting} />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" {...register('category')} disabled={isSubmitting} />
            {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {question ? 'Save Changes' : 'Add Question'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuestionFormModal;