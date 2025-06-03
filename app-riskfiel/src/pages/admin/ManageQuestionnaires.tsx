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
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import QuestionnaireFormModal from '@/components/admin/QuestionnaireFormModal';
import type { Database } from '@/integrations/supabase/types';

type QuestionnaireFromDB = Database["public"]["Tables"]["questionnaires"]["Row"];

type QuestionnaireDisplayInfo = {
  id: string;
  name: string;
  description?: string | null;
  questionsCount: number;
  providersCount: number;
  updated_at: string;
  // Keep original data for editing
  originalData: QuestionnaireFromDB;
};

const ITEMS_PER_PAGE = 10;

// Supabase interaction functions
const fetchQuestionnaires = async (): Promise<QuestionnaireDisplayInfo[]> => {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(q => ({
    ...q,
    questionsCount: q.question_ids?.length || 0,
    providersCount: q.provider_ids?.length || 0,
    originalData: q,
  }));
};

const deleteQuestionnaireDB = async (id: string): Promise<void> => {
  const { error } = await supabase.from('questionnaires').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

const ManageQuestionnaires = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<QuestionnaireFromDB | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: questionnaires = [], isLoading, error } = useQuery<QuestionnaireDisplayInfo[]>({
    queryKey: ['questionnaires'],
    queryFn: fetchQuestionnaires,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuestionnaireDB,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
      toast({ title: 'Success', description: 'Questionnaire deleted successfully.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: `Failed to delete questionnaire: ${err.message}`, variant: 'destructive' });
    },
  });

  const handleOpenAddModal = () => {
    setEditingQuestionnaire(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (questionnaire: QuestionnaireFromDB) => {
    setEditingQuestionnaire(questionnaire);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this questionnaire? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredQuestionnaires = useMemo(() => {
    if (!searchTerm) return questionnaires;
    return questionnaires.filter(q =>
      q.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.description && q.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [questionnaires, searchTerm]);

  const paginatedQuestionnaires = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestionnaires.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredQuestionnaires, currentPage]);

  const totalPages = Math.ceil(filteredQuestionnaires.length / ITEMS_PER_PAGE);

  if (error) {
    return (
      <DashboardLayout title="Manage Questionnaires">
        <div className="text-destructive text-center py-10">Error loading questionnaires: {error.message}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Manage Questionnaires">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Questionnaires</h2>
          <Button onClick={handleOpenAddModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Questionnaire
          </Button>
        </div>

        <Input
          type="text"
          placeholder="Search questionnaires by name or description..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full p-2"
        />

        {isLoading ? (
           <div className="flex justify-center items-center h-64">
             <Loader2 className="h-12 w-12 animate-spin text-primary" />
           </div>
        ) : (
          <>
            <Table>
              <TableCaption>A list of your questionnaires.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Questions</TableHead>
                  <TableHead className="text-center">Providers</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedQuestionnaires.length > 0 ? (
                  paginatedQuestionnaires.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium max-w-xs truncate" title={q.name}>{q.name}</TableCell>
                      <TableCell className="text-center">{q.questionsCount}</TableCell>
                      <TableCell className="text-center">{q.providersCount}</TableCell>
                      <TableCell>{new Date(q.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEditModal(q.originalData)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(q.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      No questionnaires found. {searchTerm && "Try adjusting your search."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

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

      <QuestionnaireFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        questionnaire={editingQuestionnaire}
      />
    </DashboardLayout>
  );
};

export default ManageQuestionnaires;