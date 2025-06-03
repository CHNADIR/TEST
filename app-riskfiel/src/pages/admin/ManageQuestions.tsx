import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Edit, Trash2, MoreHorizontal, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast'; // Using the specified toast
import QuestionFormModal from '@/components/admin/QuestionFormModal'; // We'll create this next

export type Question = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  created_at: string;
  updated_at: string;
};

const ITEMS_PER_PAGE = 10;

// Supabase interaction functions
const fetchQuestions = async (): Promise<Question[]> => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
};

const deleteQuestion = async (id: string): Promise<void> => {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

const ManageQuestions = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');


  const { data: questions = [], isLoading, error } = useQuery<Question[]>({
    queryKey: ['questions'],
    queryFn: fetchQuestions,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast({ title: 'Success', description: 'Question deleted successfully.', variant: 'default' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: `Failed to delete question: ${err.message}`, variant: 'destructive' });
    },
  });

  const handleOpenAddModal = () => {
    setEditingQuestion(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (question: Question) => {
    setEditingQuestion(question);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredQuestions = useMemo(() => {
    if (!searchTerm) return questions;
    return questions.filter(q =>
      q.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.category && q.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [questions, searchTerm]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredQuestions, currentPage]);

  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);

  if (error) {
    return (
      <DashboardLayout title="Manage Questions">
        <div className="text-destructive">Error loading questions: {error.message}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Manage Questions">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Questions</h2>
          <Button onClick={handleOpenAddModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Question
          </Button>
        </div>

        {/* Search Input - Basic example */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search questions by title or category..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset to first page on search
            }}
            className="w-full p-2 border border-input rounded-md"
          />
        </div>

        {isLoading ? (
           <div className="flex justify-center items-center h-64">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
           </div>
        ) : (
          <>
            <Table>
              <TableCaption>A list of your questions.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedQuestions.length > 0 ? (
                  paginatedQuestions.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell className="font-medium max-w-xs truncate" title={question.title}>{question.title}</TableCell>
                      <TableCell>{question.category || 'N/A'}</TableCell>
                      <TableCell>{new Date(question.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEditModal(question)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(question.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      No questions found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <QuestionFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        question={editingQuestion}
      />
    </DashboardLayout>
  );
};

export default ManageQuestions;