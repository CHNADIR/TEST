import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "@/components/ui/toaster"; // Assuming this is your toast component

import AuthPage from './pages/Auth';
import SetPasswordPage from './pages/SetPassword';
import DashboardPage from './pages/Dashboard';
import UnauthorizedPage from './pages/Unauthorized';
import NotFoundPage from './pages/NotFound'; // Assuming you have a 404 page

import ManageProvidersPage from './pages/admin/ManageProviders';
import ManageAdminsPage from './pages/admin/ManageAdmins';
// import ManageQuestionsPage from './pages/admin/ManageQuestions'; // Semble être dupliqué par ManageQuestions plus bas
import ManageQuestionnairesPage from './pages/admin/ManageQuestionnaires'; // CORRIGÉ ICI SI LE NOM EST ManageQuestionnaires.tsx
import ProviderProfilePage from './pages/provider/ProviderProfile';
import MyQuestionnairesPage from './pages/provider/MyQuestionnaires';
import NotificationsPage from './pages/Notifications'; // <-- IMPORT NEW PAGE
import QuestionnaireDetailPage from './pages/provider/QuestionnaireDetailPage'; // <-- ADD THIS IMPORT
import AdminQuestionnaireResponsesPage from './pages/admin/AdminQuestionnaireResponsesPage';
// import AdminReviewSubmissionsPage from './pages/admin/AdminReviewSubmissionsPage'; // ANCIENNE - Supprimée ou commentée
// import QuestionnaireAdminReviewPage from './pages/admin/QuestionnaireAdminReviewPage'; // ANCIENNE - Supprimée ou commentée
import AdminSubmissionsListPage from './pages/admin/AdminSubmissionsListPage'; // NOUVELLE
import AdminDetailedSubmissionReviewPage from './pages/admin/AdminDetailedSubmissionReviewPage'; // NOUVELLE
import LoadingScreen from './components/LoadingScreen';

import { ProtectedRoute, RoleRedirect, SuperAdminRoute } from './middleware/authMiddleware';
import { useAuthStore } from './stores/authStore';
import Dashboard from './pages/Dashboard'; // Renommé en DashboardPage ?
import ManageQuestions from './pages/admin/ManageQuestions'; // Ce fichier existe-t-il ? Ou est-ce ManageQuestionsPage ?

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    },
  },
});

const AppRoutes = () => {
  const { loading: authLoading, initialized, user } = useAuthStore(); // Ajout de initialized et user

  if (!initialized || authLoading) { // Modifié pour attendre l'initialisation
    return <LoadingScreen />;
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Redirect root based on role or to auth */}
      <Route path="/" element={<RoleRedirect />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} /> {/* <-- ADD NEW ROUTE */}

        {/* Provider Routes */}
        <Route element={<ProtectedRoute allowedRoles={['provider']} />}>
          <Route path="/provider/profile" element={<ProviderProfilePage />} />
          <Route path="/provider/my-questionnaires" element={<MyQuestionnairesPage />} />
          <Route path="/provider/questionnaires/:questionnaireId" element={<QuestionnaireDetailPage />} /> {/* <-- ADD THIS ROUTE */}
          {/* Add other provider-specific routes here */}
        </Route>
        {/* Admin & SuperAdmin Routes */}
        <Route element={<ProtectedRoute allowedRoles={['admin', 'superAdmin']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin/manage-providers" element={<ManageProvidersPage />} />
          <Route path="/admin/manage-questionnaires" element={<ManageQuestionnairesPage />} />
          <Route path="/admin/manage-questions" element={<ManageQuestions />} />
          <Route path="/admin/questionnaires/:questionnaireId/responses/:providerId" element={<AdminQuestionnaireResponsesPage />} />
          {/* <Route path="/admin/review-submissions" element={<AdminReviewSubmissionsPage />} /> */}
          {/* <Route path="/admin/review/:questionnaireId/:providerId" element={<QuestionnaireAdminReviewPage />} /> */}
          <Route path="/admin/submissions-to-review" element={<AdminSubmissionsListPage />} />
          <Route path="/admin/review-submission/:questionnaireId/:providerId" element={<AdminDetailedSubmissionReviewPage />} />
        </Route>
        {/* SuperAdmin Only Routes */}
        <Route element={<SuperAdminRoute />}>
          <Route path="/admin/manage-admins" element={<ManageAdminsPage />} />
        </Route>
      </Route>
      
      {/* Catch-all for 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Router>
      <AppRoutes />
    </Router>
    <Toaster />
  </QueryClientProvider>
);

export default App;
