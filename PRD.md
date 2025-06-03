# Product Requirements Document (PRD) – RiskFiel

## 1\. Titre

RiskFiel – Plateforme SaaS d’évaluation, de sécurisation et de conformité des solutions des fournisseurs.

## 2\. Vue d’ensemble, Objectifs et Critères de Réussite

Vue d’ensemble  
RiskFiel est une plateforme SaaS permettant à Windfiel de piloter la conformité de ses fournisseurs (SaaS, IaaS, autres) via l'envoi de questionnaires de sécurité, la collecte de justificatifs et l’évaluation des risques via un système de scoring. La plateforme assure la traçabilité, simplifie la collaboration, automatise les relances et garantit la conformité RGPD et d’autres normes

Objectifs

- Réduire les tâches manuelles et améliorer la productivité.
    
- Centraliser les informations fournisseurs et pièces justificatives.
    
- Améliorer la conformité aux réglementations RGPD, DORA et autres.
    
- Assurer une conformité continue grâce à des relances automatiques.
    
- Diminuer les risques d’erreurs et de fuites de données.
    
- Simplifier l'expérience fournisseur avec une interface claire et sécurisée.
    

Critères de Réussite

- Taux d’adoption de la plateforme par l’équipe de Windfiel (objectif de 90 % des évaluations effectuées via la plateforme).
    
- Diminution du temps moyen consacré à l’évaluation de chaque fournisseur (objectif de -30 % par rapport au processus manuel).
    
- Amélioration de la réactivité des fournisseurs (objectif de 80 % de questionnaires complétés dans les délais).
    
- Stabilité et performance : 99,9 % de disponibilité et temps de réponse < 2 secondes sur les pages principales.
    

3\. Objectif et Contexte

Problème Résolu

- Processus d’évaluation manuel inefficace, risque élevé d’erreurs.
    
- Difficultés à centraliser et à sécuriser les documents justificatifs.
    
- Manque de traçabilité sur les échanges et décisions.
    

Pourquoi ce produit est nécessaire

- Centraliser la collecte de données de conformité (questionnaires) dans un outil unique.
    
- Faciliter la collaboration et accélérer la prise de décision (score automatique et relances).
    
- Constituer un historique pour suivre l’évolution du niveau de conformité des fournisseurs dans le temps.
    
- Donner aux équipes de Windfiel une visibilité temps réel sur l’état de conformité.
    

Public Cible

1.  Équipes Sécurité/Audit de Windfiel (administrateurs de la plateforme).
    
2.  Équipes Achats / Partenariats de Windfiel (décideurs pour la collaboration avec les fournisseurs).
    
3.  Fournisseurs (entreprises tierces) devant répondre aux questionnaires de sécurité et joindre leurs preuves.
    

Contexte Concurrentiel

- D’autres plateformes de GRC (Governance, Risk & Compliance) existent sur le marché.
    
- Le positionnement unique de RiskFiel vise à simplifier le processus et à automatiser l’évaluation via un scoring précis.
    

## 4\. Fonctionnalités et Estimations Relatives

|     |     |
| --- | --- |
| Fonctionnalité | Estimation |
| 1\. Création et gestion des fiches fournisseurs | M   |
| 2\. Gestion d’authentification et d’autorisation | M   |
| 3\. Création et gestion des questionnaires (par Windfiel) | M   |
| 4\. Réponse aux questionnaires par le fournisseur (avec PJ) | M   |
| 5\. Système de relecture/demande de précisions (aller-retour) | M   |
| 6\. Calcul du score d’évaluation et seuil de conformité | L   |
| 7\. Base de données centralisée (stockage PJ, historique) | M   |
| 8\. Relances automatiques | M   |
| 9\. Tableau de bord d’administration | L   |

## 5\. Descriptions Fonctionnelles de Haut Niveau

1.  Création et gestion des fiches fournisseurs

- Windfiel crée un enregistrement pour chaque nouveau fournisseur, contenant les informations de base (raison sociale, point de contact, type de solution, etc.).
    
- Le fournisseur peut se connecter pour compléter ou mettre à jour ses informations.
    

3.  Gestion d’authentification et d’autorisation

- En utilisant SupaBase et Auth0, chaque utilisateur (admin, auditeur, ou fournisseur) peut accéder à la palteforme via un accès sécurisé avec des permissions spécifiques.  
    <br/>

5.  Création et gestion des questionnaires

- Windfiel crée plusieurs questionnaires adaptables selon le type de solution (SaaS, IaaS, on-premise, etc.).
    
- Chaque questionnaire comporte une liste de questions, certaines nécessitant des pièces jointes.
    

7.  Réponse aux questionnaires par le fournisseur

- Le fournisseur reçoit un lien ou une invitation pour se connecter.
    
- Il répond aux questions (texte, oui/non, sélection multiple, etc.) et attache des pièces justificatives (PDF, screenshots…).
    

9.  Relecture/demande de précisions

- Une fois le questionnaire rempli, Windfiel peut demander des clarifications. Le questionnaire retourne alors dans le statut « en attente de précisions » chez le fournisseur.
    
- Toutes les interactions sont stockées pour un audit trail complet.
    

11. Calcul du score et seuil de conformité

- Chaque réponse est pondérée (en interne) pour calculer un score global.
    
- Windfiel définit un score minimum pour considérer la solution comme suffisamment conforme.
    

13. Base de données centralisée

- Toutes les informations (réponses, pièces jointes, score, historique) sont stockées dans la base MongoDB.
    
- L’historique permet de consulter les versions précédentes des questionnaires et leurs réponses.
    

15. Relances automatiques

- Chaque année (ou selon la configuration), une relance est envoyée au fournisseur pour réévaluer la solution et actualiser son score.
    
- Des notifications sont également prévues pour avertir Windfiel et le fournisseur de la date limite.
    

17. Tableau de bord / Reporting

- Un panneau d’administration affiche la liste des fournisseurs, leurs statuts (questionnaire en cours, validé, etc.) et leurs scores.
    
- Des rapports peuvent être exportés (CSV, PDF).
    

## 6\. Détails des Fonctionnalités (UX Flows, Wireframes, Critères d’Acceptation)

### 6.1 Création et gestion des fiches fournisseurs

- Parcours Utilisateur (Windfiel)
    
- Se connecter à la plateforme.
    
- Cliquer sur « Créer un nouveau fournisseur ».
    
- Remplir les champs obligatoires (nom, contact, type de solution…).
    
- Sauvegarder → la fiche apparaît dans la liste des fournisseurs.
    
- Critères d’Acceptation
    
- Un fournisseur ne peut exister en double (contrôle sur la raison sociale / email).
    
- La fiche doit être modifiable jusqu’à l’invitation envoyée.
    

### 6.2 Création et gestion des questionnaires

- Parcours Utilisateur (Windfiel)
    
- Sur l’interface d’administration, cliquer sur « Créer Questionnaire ».
    
- Saisir un titre, la catégorie (SaaS, IaaS, etc.), les questions et les types de réponses attendues.
    
- Les questions peuvent être marquées comme obligatoires ou optionnelles.
    
- Lier le questionnaire à un ou plusieurs fournisseurs.
    
- Critères d’Acceptation
    
- Chaque question doit avoir un type (ouvert, choix multiple, etc.).
    
- Les réponses aux questionnaires doivent être versionnés (pour historique).
    

### 6.3 Réponses aux questionnaires

- Parcours Utilisateur (Fournisseur)
    
- Recevoir un email avec un lien / invitation.
    
- Se connecter ou créer un compte sur la plateforme (via Auth0/SAML).
    
- Accéder au questionnaire, répondre aux questions et joindre des fichiers.
    
- Soumettre pour validation.
    
- Critères d’Acceptation
    
- Impossible de soumettre si toutes les questions obligatoires ne sont pas remplies.
    
- Les PJ doivent respecter un format et une taille limite.
    

### 6.4 Demande de précisions / réouverture

- Parcours Utilisateur (Windfiel)
    
- Ouvrir la fiche d’un questionnaire complété.
    
- Cliquer sur « Demande de précisions » pour marquer certaines questions.
    
- Envoyer la demande → Le fournisseur reçoit une notification.
    
- Critères d’Acceptation
    
- Le statut du questionnaire redevient « En cours » pour le fournisseur.
    
- L’historique des échanges est consultable.
    

### 6.5 Calcul du score et seuil de conformité

- Fonctionnement
    
- Chaque réponse est évaluée selon un système de pondération définie par Windfiel.
    
- Le score global est comparé à un seuil configurable.
    
- Critères d’Acceptation
    
- Le score doit apparaître dans le tableau de bord.
    
- Les fournisseurs sous le seuil sont marqués comme « Non-conforme » ou « Sous conditions ».
    

### 6.6 Relances automatiques

- Fonctionnement
    
- Un scheduler (ex. cron job) déclenche l’envoi d’invitations à intervalles définis (annuel).
    
- Les questionnaires de l’année précédente sont archivés dans la abse de données.
    
- Critères d’Acceptation
    
- Les fournisseurs reçoivent un email de rappel.
    
- L’équipe Windfiel voit l’évolution dans le temps.
    

## 7\. Exigences Techniques

- Front-end
    
- React/Next.js (TypeScript)
    
- Gestion d’état : Redux Toolkit
    
- UI : Tailwind CSS
    
- Back-end
    
- Node.js (TypeScript)
    
- Framework : NestJS
    
- Base de données : SupaBase
    
- ORM : Prisma
    
- Authentification : Auth0 Via SupaBase
    
- Infrastructure & Hébergement : Azure (déploiement via conteneurs ACI)
    
- CI/CD : Azure DevOps (pipeline, builds automatisés)
    

## 8\. Exigences en Données et Analytique

- Collecte des données
    
- Données saisies par les fournisseurs (réponses aux questions)
    
- Métadonnées (horodatage, historique de révision)
    
- Pièces jointes stockées dans SupaBase Storage
    
- Analytique
    
- Tableaux de bord pour suivre : nombre de questionnaires en cours, scores moyens, délais de complétion, Scoring
    

## 9\. Exigences en Interface Utilisateur (UI)

- Look & Feel
    
- Design sobre et professionnel, mise en page réactive (responsive)
    
- Mise en avant de l’identité visuelle de Windfiel (logos, couleurs, etc.)
    
- Standards / Principes
    
- Utilisation de Tailwind CSS pour l’homogénéité et la rapidité de développement
    
- Navigation claire (barre de menu, pages distinctes pour Fournisseurs, Questionnaires, Tableau de bord…)
    

## 10\. Exigences de Performance

- Cibles principales
    
- Temps de réponse de l’API < 500 ms pour les requêtes courantes
    
- Chargement initial de la page < 2 secondes (Next.js SSR peut contribuer à de bonnes performances initiales)
    
- Scalabilité
    
- Possibilité de monter en charge en créant plusieurs instances conteneurisées (microservices).
    
- Supabase PostgreSQL dimensionné selon le volume de données (réponses + pièces jointes).
    

## 11\. Exigences de Sécurité

- Normes et Conformité
    
- RGPD : consentement à l’utilisation des données personnelles, droits d’accès et de suppression.  
    <br/>
    
- Accès et Autorisations
    
- Authentification via Auth0 et SupaBase; gestion des rôles (Administrateur Windfiel, Fournisseur, etc.).
    
- Connexions chiffrées en HTTPS/TLS.
    
- Tests de sécurité
    
- Vérifications SAST/DAST en CI/CD (scans réguliers).
    
- Revue de code et pentests planifiés.
    

## 12\. Timeline et Jalons

|     |     |     |
| --- | --- | --- |
| Lot du projet (Étape) | Description des tâches principales | Charge estimée |
| 1- Conception et architecture | Diagrammes fonctionnels détaillés, modélisation complète des données, conception UI/UX, Architecture technique de l’application, mise en place environnement Azure | 20 jours |
| 2- MVP opérationnel | Développement API complète, Gestion d’authentification, interface utilisateur fournisseur interactive, questionnaires adaptatifs, scoring initial, tests & déploiement MVP initial sur Azure | 40 jours |
| 3- Workflow collaboratif | Implémentation gestion complète des pièces jointes, workflow relecture/commentaires, historique complet des échanges | 15 jours |
| 4- Reporting & Dashboard | Conception avancée du tableau de bord administrateur, KPIs interactifs, optimisation UX/UI reporting | 7 jours |
| 5- Automatisation relances | Développement système automatisé des relances fournisseurs, gestion du clonage/archivage annuel des questionnaires, intégration notifications & alertes | 7 jours |
| 6- Sécurité & conformité | Intégration complète logs d’audit, scans SAST/DAST réguliers, conformité RGPD, documentation technique détaillée, tests finaux approfondis & validation complète | 6 jours |
| Total : |     | 95 jours |

## 13\. Plan de Lancement de Haut Niveau

1.  Phase Beta (MVP) : Lancer la plateforme avec un nombre restreint de fournisseurs, valider le flux principal.
    
2.  Phase Pilote : Étendre à tous les fournisseurs ciblés par Windfiel pour un test à grande échelle (performances, retours utilisateurs).
    
3.  Phase de Production : Correction des retours, activation de la relance automatique, ajout des mesures de sécurité avancées.
    
4.  Améliorations Continues : Intégration de nouvelles fonctionnalités, ajustement du scoring et éventuel passage à une architecture microservices plus poussée si la charge l’exige.
    

## 14\. Considérations Futures

- IA :
    
- Analyser automatiquement les pièces jointes pour détecter des mots-clés ou extraits cruciaux (ex. certification ISO, etc.).
    
- Calcul du scoring automatique selon les réponses des fournisseurs  
    <br/>
    
- Integration avec d’autres Outils : Connecteurs pour Slack/Teams (notifications), CRM (Salesforce, HubSpot), etc.  
    <br/>
    

Module de Benchmark : Comparer les scores de différents fournisseurs sur des critères similaires.