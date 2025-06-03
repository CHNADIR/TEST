Votre application RiskFiel est une plateforme complète conçue pour gérer les évaluations de risques à travers un système de questionnaires, impliquant différents rôles d'utilisateurs avec des fonctionnalités spécifiques. Voici un aperçu des principales fonctionnalités :

**I. Gestion des Utilisateurs et Authentification**

-   **Rôles Utilisateurs :**
-   `superAdmin` : Contrôle total, y compris la gestion des autres administrateurs.
-   `admin` : Gère les fournisseurs, les questionnaires, les questions et le processus de révision.
-   [provider](about:blank) : Entités externes (fournisseurs) qui répondent aux questionnaires.
-   **Authentification :** Gérée par Supabase Auth. Les nouveaux utilisateurs sont invités par email ([supabase/functions/invite-user/index.ts](about:blank)), définissent un mot de passe et accèdent à l'application en fonction de leur rôle.
-   **Gestion des Comptes :**
-   Les administrateurs peuvent consulter les détails des utilisateurs (`[get_user_details_by_admin](about:blank)` [RPC](about:blank)).
-   Les métadonnées des utilisateurs (comme le [displayName](about:blank)) peuvent être mises à jour ([UserEditModal.tsx](about:blank), RPC `update_user_metadata_by_admin`).
-   Les rôles peuvent être révoqués (`[revoke_user_app_role](about:blank)` [RPC](about:blank)).
-   Les `superAdmin` peuvent supprimer définitivement des utilisateurs ([supabase/functions/hard-delete-user/index.ts](about:blank)).

**II. Gestion des Questionnaires et des Questions (Admin)**

-   **Gestion des Questions :** Les `admin` et `superAdmin` peuvent créer, lire, mettre à jour et supprimer des questions d'évaluation via la page `/admin/manage-questions` (`src/pages/admin/ManageQuestions.tsx`). Les questions sont stockées dans la table `public.questions`.
-   **Gestion des Questionnaires :**
-   Page `/admin/manage-questionnaires` (`src/pages/admin/ManageQuestionnaires.tsx`) pour le CRUD des questionnaires (nom, description).
-   Association d'une liste ordonnée de questions à chaque questionnaire (via RPC `set_questions_for_questionnaire`).
-   Assignation des questionnaires à un ou plusieurs fournisseurs (via RPC `assign_questionnaire_to_providers`). Cela crée des entrées dans `provider_questionnaire_status` avec le statut `pending`.

**III. Workflow du Fournisseur (**[**provider**](about:blank)**)**

-   **Tableau de Bord :** La page `/provider/my-questionnaires` ([MyQuestionnairesPage.tsx](about:blank)) liste les questionnaires assignés au fournisseur, avec leur statut actuel (ex: `Pending Start`, `In Progress`, `Submitted`, `Needs Clarification`, `Reviewed`).
-   **Réponse aux Questionnaires :**
-   Accès à la page de détail d'un questionnaire via `/provider/questionnaires/:questionnaireId` ([QuestionnaireDetailPage.tsx](about:blank)).
-   Affichage des questions du questionnaire.
-   Saisie des réponses textuelles.
-   Possibilité de joindre des fichiers (PDF, images, SVG) à chaque réponse (RESUME.md). Les fichiers sont téléversés de manière sécurisée vers Supabase Storage (bucket `questionnaire-attachments`).
-   Sauvegarde individuelle et progressive des réponses (texte et pièce jointe) via la RPC `save_provider_single_answer` (RESUME.md).
-   Affichage de l'heure de la dernière sauvegarde.
-   **Soumission et Suivi :**
-   Soumission de l'ensemble des réponses via la RPC `submit_questionnaire_answers_and_notify_admins`. Le statut du questionnaire passe à `submitted`.
-   Validation pour empêcher la soumission si des questions obligatoires ne sont pas répondues.
-   Si un questionnaire est retourné pour clarification (`needs_clarification`), le fournisseur voit les commentaires de l'admin, peut rééditer ses réponses et resoumettre le questionnaire. Le bouton de soumission devient "Resubmit Answers" (RESUME.md).

**IV. Workflow de Révision par l'Administrateur (**`**admin**`**,** `**superAdmin**`**)**

-   **Tableau de Bord des Soumissions :**
-   Page `/admin/submissions-to-review` (`AdminSubmissionsListPage.tsx`) listant les questionnaires soumis par les fournisseurs et en attente de révision.
-   **Révision Détaillée des Soumissions :**
-   Page dédiée (ex: `/admin/review-submission/:questionnaireId/:providerId` (`AdminDetailedSubmissionReviewPage.tsx`) ou l'ancienne `/admin/review/:questionnaireId/:providerId` ([QuestionnaireAdminReviewPage.tsx](about:blank))) pour examiner les réponses d'un fournisseur.
-   Affichage des réponses textuelles et des pièces jointes (accès sécurisé via des URLs signées générées dynamiquement (RESUME.md)).
-   **Processus de Révision par Question :**
-   Pour chaque réponse, l'admin peut :
-   Marquer la réponse comme "Claire" (`clear`). Si claire, attribuer un score (ex: 1-5) et optionnellement une remarque interne.
-   Marquer la réponse comme "Nécessite Clarification" (`needs_clarification_requested` ou `not_clear`). Si besoin de clarification, rédiger une demande visible par le fournisseur.
-   Les revues individuelles sont sauvegardées via la RPC `save_admin_individual_question_review` (`AdminDetailedSubmissionReviewPage.tsx`).
-   **Finalisation de la Révision :**
-   L'admin soumet l'ensemble des évaluations via la RPC `admin_finalize_detailed_review`.
-   Cette fonction met à jour les statuts dans `provider_responses` et `provider_questionnaire_status` (ex: `reviewed`, `needs_clarification`).
-   Un score moyen peut être calculé si le questionnaire est marqué comme `reviewed`.
-   Un commentaire global peut être ajouté.

**V. Système de Notifications et Communication**

-   **Notifications In-App :**
-   La table `public.notifications` enregistre divers événements.
-   Les fournisseurs reçoivent des notifications pour : l'assignation d'un nouveau questionnaire, la fin de la révision (avec score), ou une demande de clarification.
-   Les administrateurs sont notifiés lors de la soumission d'un questionnaire par un fournisseur.
-   Une page `/notifications` ([NotificationsPage.tsx](about:blank)) centralise les notifications de l'utilisateur connecté.
-   Un badge dans la barre de navigation ([DashboardLayout.tsx](about:blank)) indique le nombre de notifications non lues.
-   Les notifications peuvent être marquées comme lues.
-   **Notifications par Email :**
-   Un envoi d'emails via Resend est configuré pour les nouvelles notifications ([supabase/functions/handle-email-sending/index.ts](about:blank)).
-   Ceci est déclenché par un Database Webhook de Supabase qui écoute les insertions sur la table `public.notifications` (RESUME.md).

**VI. Architecture et Technologies Clés**

-   **Backend :** Supabase (PostgreSQL pour la base de données, Auth pour l'authentification, Storage pour le stockage de fichiers, Edge Functions pour la logique serveur sans état, Database Webhooks pour réagir aux événements de la base de données).
-   **Logique Métier :** Principalement implémentée via des fonctions PostgreSQL (RPC) pour un accès sécurisé et centralisé aux données.
-   **Sécurité :** Politiques de Sécurité au Niveau des Lignes (RLS) sur les tables PostgreSQL pour un contrôle d'accès granulaire en fonction du rôle de l'utilisateur. Les fonctions RPC utilisent souvent `SECURITY DEFINER` avec des vérifications de rôle internes.
-   **Frontend :** React avec TypeScript, utilisant Vite comme outil de build.
-   **Gestion de l'État :**
-   TanStack Query (React Query) pour la gestion de l'état serveur (data fetching, caching, mutations).
-   Zustand ([authStore.ts](about:blank)) pour la gestion de l'état global côté client (ex: informations d'authentification).
-   **Interface Utilisateur :** Utilisation de composants de Shadcn/ui (Button, Card, Input, Label, etc.) et de `sonner` pour les notifications toast.