# RiskFiel

RiskFiel est une plateforme complète d'évaluation des risques qui permet aux organisations de créer, d'attribuer et d'examiner des questionnaires à des fins d'évaluation des risques.

## Aperçu

Cette application web simplifie le processus d'évaluation des risques grâce à des questionnaires structurés. Elle dispose d'un système d'accès basé sur les rôles, permettant aux administrateurs de créer et de gérer des questionnaires tandis que les fournisseurs (entités externes) y répondent. La plateforme comprend un flux de travail d'examen détaillé et un système de notification pour tenir tous les utilisateurs informés des mises à jour importantes.

## Fonctionnalités

### Gestion des utilisateurs

-   **Contrôle d'accès basé sur les rôles:**
-   `superAdmin`: Accès complet au système, y compris la gestion des administrateurs
-   `admin`: Gestion des fournisseurs, des questionnaires et examen des soumissions
-   `provider`: Répondre aux questionnaires assignés
-   **Système d'invitation d'utilisateurs** par email
-   **Authentification sécurisée** alimentée par Supabase Auth

### Système de questionnaires

-   Créer et gérer des questions de différents formats
-   Assembler des questionnaires à partir de banques de questions
-   Assigner des questionnaires à des fournisseurs spécifiques
-   Sauvegarder les réponses individuellement ou soumettre des questionnaires complets
-   Joindre des documents justificatifs (PDF, images, SVG)

### Processus d'examen

-   Les administrateurs peuvent examiner les questionnaires soumis
-   Noter les réponses sur une échelle de 0 à 5
-   Demander des clarifications pour des réponses spécifiques
-   Ajouter des remarques internes visibles uniquement par les administrateurs
-   Consulter les pièces jointes de manière sécurisée via des URL signées

### Notifications

-   Système de notification intégré à l'application
-   Notifications par email via Resend
-   Suivi du statut lu/non lu
-   Liens de navigation vers le contenu pertinent

## Stack technologique

-   **Frontend**:
-   React avec TypeScript
-   Vite pour un développement et une construction rapides
-   TanStack Query pour la gestion de l'état du serveur
-   Zustand pour la gestion de l'état client
-   Composants Shadcn UI pour un design cohérent
-   **Backend**:
-   Supabase (base de données PostgreSQL)
-   Supabase Auth pour l'authentification
-   Supabase Storage pour le stockage de fichiers
-   Fonctions Edge de Supabase pour les opérations serverless
-   Politiques de sécurité au niveau des lignes (RLS) pour la protection des données

## Mise en route

### Prérequis

-   Node.js 16+
-   Compte Supabase
-   Compte Resend (pour les notifications par email)

### Installation

1.  Cloner le dépôt
```
git clone https://github.com/your-username/riskfiel.git

cd riskfiel
```

1.  Installer les dépendances
```
npm install
# ou
bun install
```
  
1.  Créer un fichier [.env](about:blank) basé sur `.env.example` et remplir avec vos identifiants Supabase
2.  Démarrer le serveur de développement
```
npm run dev
# ou
bun dev
```
  

### Déploiement

Pour construire l'application pour la production:
```
npm run build
# ou
bun build
```
  

Les fichiers construits seront dans le répertoire `dist`, prêts à être déployés sur n'importe quel service d'hébergement statique.

## Structure du projet
```
src/
├── components/     # Composants UI réutilisables
├── hooks/          # Hooks React personnalisés
├── integrations/   # Intégrations de services externes
├── lib/            # Fonctions utilitaires
├── middleware/     # Middleware d'authentification
├── pages/          # Pages de l'application
├── stores/         # Gestion d'état
└── types/          # Définitions de types TypeScript

supabase/
├── functions/      # Fonctions Edge
└── schema.sql      # Schéma de base de données
```
  

## Sécurité

RiskFiel implémente des mesures de sécurité robustes:

-   Les politiques de sécurité au niveau des lignes (RLS) restreignent l'accès aux données en fonction des rôles des utilisateurs
-   Fonctions SQL security-definer avec vérification des rôles
-   Stockage de fichiers sécurisé avec accès contrôlé
-   Authentification basée sur JWT