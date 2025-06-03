

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."admin_clarity_status_enum" AS ENUM (
    'pending_review',
    'clear',
    'needs_clarification_requested',
    'clarification_provided'
);


ALTER TYPE "public"."admin_clarity_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'superAdmin',
    'admin',
    'provider'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."clarity_status_enum" AS ENUM (
    'clear',
    'not_clear',
    'pending'
);


ALTER TYPE "public"."clarity_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."review_status_enum" AS ENUM (
    'pending',
    'reviewed',
    'needs_clarification',
    'clarification_provided'
);


ALTER TYPE "public"."review_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_finalize_detailed_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_detailed_reviews" "jsonb", "p_global_questionnaire_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role public.app_role;
    v_review_item JSONB;
    v_question_id_item UUID;
    v_clarity_status_item public.clarity_status_enum;
    v_score_item INTEGER;
    v_admin_remark_item TEXT;
    v_clarification_request_item TEXT;
    
    v_total_score_for_clear_questions INTEGER := 0;
    v_clear_and_scored_questions_count INTEGER := 0;
    v_average_score NUMERIC;
    
    v_overall_review_status public.review_status_enum := 'reviewed'; -- Par défaut 'reviewed'
    v_has_clarification_requests BOOLEAN := FALSE;
    v_all_questions_processed BOOLEAN := TRUE; -- Pour s'assurer que toutes les questions ont été traitées

    v_questionnaire_name TEXT;
    v_provider_email TEXT;
BEGIN
    -- Vérification des permissions de l'appelant
    SELECT ur.role INTO v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_uid LIMIT 1;
    IF v_caller_role IS NULL OR (v_caller_role NOT IN ('admin', 'superAdmin')) THEN
        RAISE EXCEPTION 'Permission denied: Caller is not an authorized administrator. UID: %, Role: %', v_caller_uid, v_caller_role;
    END IF;

    -- Récupérer les informations pour les notifications
    SELECT q.name INTO v_questionnaire_name FROM public.questionnaires q WHERE q.id = p_questionnaire_id;
    SELECT u.email INTO v_provider_email FROM auth.users u WHERE u.id = p_provider_id;

    -- Itérer sur chaque revue détaillée de question
    FOR v_review_item IN SELECT * FROM jsonb_array_elements(p_detailed_reviews) LOOP
        v_question_id_item := (v_review_item->>'question_id')::UUID;
        v_clarity_status_item := (v_review_item->>'clarity_status')::public.clarity_status_enum;
        
        -- Réinitialiser les champs pour chaque question avant de mettre à jour
        UPDATE public.provider_responses
        SET 
            clarity_status = 'pending', -- ou NULL selon votre préférence pour l'état initial
            admin_score = NULL,
            admin_remark = NULL,
            clarification_request_text = NULL,
            is_clarification_resolved = FALSE -- Réinitialiser si on re-évalue
        WHERE questionnaire_id = p_questionnaire_id
          AND provider_id = p_provider_id
          AND question_id = v_question_id_item;

        IF v_clarity_status_item = 'clear' THEN
            v_score_item := (v_review_item->>'score')::INTEGER;
            v_admin_remark_item := v_review_item->>'admin_remark';

            IF v_score_item IS NULL OR v_score_item < 1 OR v_score_item > 5 THEN
                RAISE EXCEPTION 'Invalid score % for question_id %. Score must be between 1 and 5 for clear answers.', v_score_item, v_question_id_item;
            END IF;

            UPDATE public.provider_responses
            SET 
                clarity_status = 'clear',
                admin_score = v_score_item,
                admin_remark = v_admin_remark_item,
                clarification_request_text = NULL, -- S'assurer qu'il n'y a pas de demande de clarification
                is_clarification_resolved = TRUE -- Si c'est clair et noté, on peut considérer la clarification comme résolue
            WHERE questionnaire_id = p_questionnaire_id
              AND provider_id = p_provider_id
              AND question_id = v_question_id_item;

            IF FOUND THEN
                v_total_score_for_clear_questions := v_total_score_for_clear_questions + v_score_item;
                v_clear_and_scored_questions_count := v_clear_and_scored_questions_count + 1;
            ELSE
                 RAISE WARNING 'No response found to update for question_id % (status: clear)', v_question_id_item;
                 v_all_questions_processed := FALSE;
            END IF;

        ELSIF v_clarity_status_item = 'not_clear' THEN
            v_clarification_request_item := v_review_item->>'clarification_request';

            IF v_clarification_request_item IS NULL OR TRIM(v_clarification_request_item) = '' THEN
                RAISE EXCEPTION 'Clarification request text is required for question_id % marked as not_clear.', v_question_id_item;
            END IF;

            UPDATE public.provider_responses
            SET 
                clarity_status = 'not_clear',
                clarification_request_text = v_clarification_request_item,
                admin_score = NULL, -- Pas de score si pas clair
                admin_remark = NULL, -- Pas de remarque interne si pas clair
                is_clarification_resolved = FALSE
            WHERE questionnaire_id = p_questionnaire_id
              AND provider_id = p_provider_id
              AND question_id = v_question_id_item;
            
            IF FOUND THEN
                v_has_clarification_requests := TRUE;
            ELSE
                RAISE WARNING 'No response found to update for question_id % (status: not_clear)', v_question_id_item;
                v_all_questions_processed := FALSE;
            END IF;
        ELSIF v_clarity_status_item = 'pending' THEN
             RAISE WARNING 'Question_id % was left as pending. This should be handled by frontend validation.', v_question_id_item;
             v_all_questions_processed := FALSE; -- Marquer que tout n'est pas traité
        ELSE
            RAISE EXCEPTION 'Invalid clarity_status % for question_id %.', v_clarity_status_item, v_question_id_item;
        END IF;
    END LOOP;

    -- Déterminer le statut global de révision
    IF v_has_clarification_requests THEN
        v_overall_review_status := 'needs_clarification';
    ELSIF v_clear_and_scored_questions_count = (SELECT COUNT(*) FROM jsonb_array_elements(p_detailed_reviews)) AND v_all_questions_processed THEN
        -- Toutes les questions ont été traitées, aucune n'a besoin de clarification, et toutes les claires sont notées.
        v_overall_review_status := 'reviewed';
    ELSE
        -- Cas où certaines questions sont 'pending' ou une erreur s'est produite.
        -- Le statut pourrait rester 'pending' ou un autre état d'erreur, selon la logique métier.
        -- Pour l'instant, si pas de clarification mais pas tout noté, on pourrait considérer 'pending' ou erreur.
        -- Si v_all_questions_processed est false, cela indique un problème.
        RAISE WARNING 'Not all questions were fully processed or met review criteria. Overall status might be inaccurate.';
        -- On pourrait choisir de ne pas mettre à jour le statut global ou de le mettre à 'pending'.
        -- Pour cet exemple, si on arrive ici et pas de clarification, on le laisse 'reviewed' mais le score sera basé sur ce qui a été noté.
        -- Une meilleure approche serait de s'assurer que le frontend valide que toutes les questions ont un statut final.
        IF NOT v_has_clarification_requests THEN
             v_overall_review_status := 'reviewed'; -- Ou 'pending' si on veut forcer une revue complète
        ELSE
             v_overall_review_status := 'needs_clarification'; -- S'il y a des clarifications, c'est prioritaire
        END IF;
    END IF;

    -- Calculer le score global moyen (basé sur les questions claires et notées)
    IF v_clear_and_scored_questions_count > 0 THEN
        v_average_score := v_total_score_for_clear_questions::NUMERIC / v_clear_and_scored_questions_count;
    ELSE
        v_average_score := NULL; -- Pas de score si aucune question claire n'a été notée
    END IF;

    -- Mettre à jour la table provider_questionnaire_status
    UPDATE public.provider_questionnaire_status
    SET
        review_status = v_overall_review_status,
        score = CASE 
                    WHEN v_overall_review_status = 'reviewed' THEN ROUND(v_average_score) 
                    ELSE NULL -- Pas de score global si 'needs_clarification'
                END,
        review_comment = p_global_questionnaire_comment,
        reviewed_at = NOW(),
        reviewed_by_admin_id = v_caller_uid,
        status = CASE 
                    WHEN v_overall_review_status = 'reviewed' THEN 'reviewed'::text
                    WHEN v_overall_review_status = 'needs_clarification' THEN 'needs_clarification'::text
                    ELSE status -- Conserver le statut actuel si 'pending'
                 END,
        submitted_at = CASE -- Ne pas réinitialiser submitted_at si on passe à needs_clarification
                          WHEN v_overall_review_status = 'needs_clarification' THEN submitted_at 
                          ELSE NOW() -- Ou submitted_at si on ne veut pas le changer pour 'reviewed'
                       END
    WHERE questionnaire_id = p_questionnaire_id AND provider_id = p_provider_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Questionnaire status not found for provider % and questionnaire %', p_provider_id, p_questionnaire_id;
    END IF;

    -- Logique de notification
    IF v_overall_review_status = 'needs_clarification' THEN
        INSERT INTO public.notifications (user_id, questionnaire_id, title, body, type)
        VALUES (
            p_provider_id,
            p_questionnaire_id,
            'Action Required: Clarification Needed for Questionnaire',
            'Your submission for questionnaire "' || COALESCE(v_questionnaire_name, 'N/A') || '" requires clarification for one or more answers. Please review the feedback provided for each question.' || CASE WHEN p_global_questionnaire_comment IS NOT NULL AND TRIM(p_global_questionnaire_comment) <> '' THEN ' Global comment: ' || p_global_questionnaire_comment ELSE '' END,
            'clarification_requested' -- Peut-être un type plus spécifique 'detailed_clarification_requested'
        );
    ELSIF v_overall_review_status = 'reviewed' THEN
        INSERT INTO public.notifications (user_id, questionnaire_id, title, body, type)
        VALUES (
            p_provider_id,
            p_questionnaire_id,
            'Questionnaire Reviewed: Average Score ' || COALESCE(ROUND(v_average_score)::TEXT, 'N/A') || '/5',
            'Your submission for questionnaire "' || COALESCE(v_questionnaire_name, 'N/A') || '" has been reviewed. Average score: ' || COALESCE(ROUND(v_average_score)::TEXT, 'N/A') || '/5.' || CASE WHEN p_global_questionnaire_comment IS NOT NULL AND TRIM(p_global_questionnaire_comment) <> '' THEN ' Global comment: ' || p_global_questionnaire_comment ELSE '' END,
            'questionnaire_scored'
        );
    END IF;

END;
$$;


ALTER FUNCTION "public"."admin_finalize_detailed_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_detailed_reviews" "jsonb", "p_global_questionnaire_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_finalize_submission_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_global_review_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role public.app_role;
    v_total_questions INT;
    v_reviewed_questions INT;
    v_questions_needing_clarification INT;
    v_total_score INT := 0;
    v_scored_questions INT := 0;
    v_average_score NUMERIC;
    v_final_review_status public.review_status_enum;
    v_questionnaire_name TEXT;
    v_provider_email TEXT;
BEGIN
    SELECT ur.role INTO v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_uid LIMIT 1;
    IF v_caller_role IS NULL OR (v_caller_role NOT IN ('admin', 'superAdmin')) THEN
        RAISE EXCEPTION 'Permission denied: Caller is not an authorized administrator.';
    END IF;

    SELECT COUNT(*) INTO v_total_questions
    FROM public.provider_responses pr
    WHERE pr.questionnaire_id = p_questionnaire_id AND pr.provider_id = p_provider_id;

    SELECT COUNT(*) INTO v_reviewed_questions
    FROM public.provider_responses pr
    WHERE pr.questionnaire_id = p_questionnaire_id
      AND pr.provider_id = p_provider_id
      AND pr.admin_clarity_status <> 'pending_review';

    IF v_total_questions <> v_reviewed_questions THEN
        RAISE EXCEPTION 'Not all questions have been reviewed. Please review all answers before finalizing.';
    END IF;

    SELECT
        COUNT(CASE WHEN pr.admin_clarity_status = 'needs_clarification_requested' THEN 1 END),
        SUM(CASE WHEN pr.admin_clarity_status = 'clear' THEN pr.admin_score ELSE 0 END),
        COUNT(CASE WHEN pr.admin_clarity_status = 'clear' AND pr.admin_score IS NOT NULL THEN 1 END)
    INTO
        v_questions_needing_clarification,
        v_total_score,
        v_scored_questions
    FROM public.provider_responses pr
    WHERE pr.questionnaire_id = p_questionnaire_id AND pr.provider_id = p_provider_id;

    IF v_questions_needing_clarification > 0 THEN
        v_final_review_status := 'needs_clarification'::public.review_status_enum;
        v_average_score := NULL;
    ELSE
        v_final_review_status := 'reviewed'::public.review_status_enum;
        IF v_scored_questions > 0 THEN
            v_average_score := ROUND(v_total_score::NUMERIC / v_scored_questions, 2);
        ELSE
            v_average_score := NULL;
        END IF;
    END IF;

    UPDATE public.provider_questionnaire_status pqs
    SET
        review_status = v_final_review_status,
        score = CASE WHEN v_final_review_status = 'reviewed' THEN v_average_score ELSE NULL END,
        review_comment = p_global_review_comment,
        reviewed_at = NOW(),
        reviewed_by_admin_id = v_caller_uid,
        status = CASE
                    WHEN v_final_review_status = 'needs_clarification' THEN 'needs_clarification'::text
                    WHEN v_final_review_status = 'reviewed' THEN 'reviewed'::text -- AJOUTÉ pour marquer comme 'reviewed'
                    ELSE pqs.status -- Conserver le statut actuel sinon
                 END
    WHERE pqs.questionnaire_id = p_questionnaire_id AND pqs.provider_id = p_provider_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provider questionnaire status not found for provider % and questionnaire %', p_provider_id, p_questionnaire_id;
    END IF;

    SELECT q.name INTO v_questionnaire_name FROM public.questionnaires q WHERE q.id = p_questionnaire_id;
    SELECT u.email INTO v_provider_email FROM auth.users u WHERE u.id = p_provider_id;

    IF v_final_review_status = 'reviewed' THEN
        INSERT INTO public.notifications (user_id, questionnaire_id, title, body, type)
        VALUES (
            p_provider_id, p_questionnaire_id,
            'Questionnaire Reviewed: ' || COALESCE(v_questionnaire_name, 'N/A'),
            'Your submission for questionnaire "' || COALESCE(v_questionnaire_name, 'N/A') || '" has been reviewed.' ||
            CASE WHEN v_average_score IS NOT NULL THEN ' Final Score: ' || v_average_score::TEXT || '/5.' ELSE '' END ||
            CASE WHEN p_global_review_comment IS NOT NULL AND TRIM(p_global_review_comment) <> '' THEN ' Admin comment: ' || p_global_review_comment ELSE '' END,
            'questionnaire_scored'
        );
    ELSIF v_final_review_status = 'needs_clarification' THEN
        INSERT INTO public.notifications (user_id, questionnaire_id, title, body, type)
        VALUES (
            p_provider_id, p_questionnaire_id,
            'Action Required for: ' || COALESCE(v_questionnaire_name, 'N/A'),
            'Clarification is needed for your submission of questionnaire "' || COALESCE(v_questionnaire_name, 'N/A') || '". Please review the comments and resubmit.' ||
            CASE WHEN p_global_review_comment IS NOT NULL AND TRIM(p_global_review_comment) <> '' THEN ' Admin comment: ' || p_global_review_comment ELSE '' END,
            'clarification_requested'
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."admin_finalize_submission_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_global_review_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_questionnaire_to_providers"("p_questionnaire" "uuid", "p_providers" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  uid uuid;
  v_questionnaire_name TEXT;
BEGIN
  SELECT name INTO v_questionnaire_name FROM public.questionnaires WHERE id = p_questionnaire;

  UPDATE public.questionnaires
  SET provider_ids = p_providers,
      updated_at   = now()
  WHERE id = p_questionnaire;

  FOREACH uid IN ARRAY p_providers LOOP
    INSERT INTO public.notifications (user_id, title, body, type, questionnaire_id)
    VALUES (uid,
            'Nouveau questionnaire assigné : ' || COALESCE(v_questionnaire_name, 'Sans nom'),
            'Vous avez un nouveau questionnaire à compléter : "' || COALESCE(v_questionnaire_name, 'Sans nom') || '".',
            'questionnaire_assigned',
            p_questionnaire);
            
    INSERT INTO public.provider_questionnaire_status (questionnaire_id, provider_id, status, review_status) -- Ajout de review_status
    VALUES (p_questionnaire, uid, 'pending', 'pending'::public.review_status_enum) -- Initialisation de review_status
    ON CONFLICT (questionnaire_id, provider_id) DO UPDATE SET
        -- Si le questionnaire est réassigné, on pourrait vouloir réinitialiser certains statuts
        -- ou simplement ne rien faire si on ne veut pas écraser un statut existant.
        -- Pour l'instant, ON CONFLICT DO NOTHING est conservé, mais considérez la logique ici.
        -- Par exemple, si réassigné, peut-être que le statut devrait redevenir 'pending'.
        status = EXCLUDED.status, -- Conserve le comportement original du ON CONFLICT DO NOTHING implicite
        review_status = EXCLUDED.review_status; -- Assure que review_status est aussi géré en cas de conflit
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."assign_questionnaire_to_providers"("p_questionnaire" "uuid", "p_providers" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_app_role"() RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT coalesce(
           (SELECT ur.role
              FROM public.user_roles ur
             WHERE ur.user_id = (SELECT auth.uid()) -- Appel à auth.uid() encapsulé
             ORDER BY ur.created_at DESC -- Bien que user_id devrait être unique
             LIMIT 1),
           'provider'::public.app_role -- Rôle par défaut si non trouvé
         );
$$;


ALTER FUNCTION "public"."current_app_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_review_submissions_list"() RETURNS TABLE("questionnaire_id" "uuid", "questionnaire_name" "text", "provider_id" "uuid", "provider_email" "text", "submission_id" "uuid", "submitted_at" timestamp with time zone, "review_status" "public"."review_status_enum", "global_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_caller_uid  uuid := auth.uid();
  v_caller_role public.app_role;
BEGIN
  SELECT ur.role
    INTO v_caller_role
    FROM public.user_roles ur
   WHERE ur.user_id = v_caller_uid
   LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin','superAdmin') THEN
    RAISE EXCEPTION 'Permission denied: Caller is not an authorized administrator.';
  END IF;

  RETURN QUERY
  SELECT
    pqs.questionnaire_id,
    q.name AS questionnaire_name,
    pqs.provider_id,
    u.email::text AS provider_email,
    pqs.id AS submission_id,
    pqs.submitted_at,
    pqs.review_status,
    pqs.status AS global_status
  FROM public.provider_questionnaire_status pqs
  JOIN public.questionnaires q ON q.id = pqs.questionnaire_id
  JOIN auth.users u ON u.id = pqs.provider_id
  WHERE 
    pqs.status = 'submitted' AND 
    pqs.review_status IN ('pending'::public.review_status_enum, 'clarification_provided'::public.review_status_enum)
  ORDER BY pqs.submitted_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_review_submissions_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_assigned_questionnaires_overview_for_admin"() RETURNS TABLE("questionnaire_id" "uuid", "questionnaire_name" "text", "provider_id" "uuid", "provider_email" character varying, "status" "text", "last_saved_at" timestamp with time zone, "submitted_at" timestamp with time zone, "assigned_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id as questionnaire_id,
        q.name as questionnaire_name,
        pqs.provider_id,
        u.email, -- Pas besoin de cast ici si le type de retour correspond
        pqs.status,
        pqs.last_saved_at,
        pqs.submitted_at,
        pqs.created_at as assigned_at
    FROM
        public.provider_questionnaire_status pqs
    JOIN
        public.questionnaires q ON pqs.questionnaire_id = q.id
    JOIN
        auth.users u ON pqs.provider_id = u.id
    ORDER BY
        CASE pqs.status
            WHEN 'in_progress' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'submitted' THEN 3
            ELSE 4
        END,
        pqs.last_saved_at DESC NULLS LAST, 
        q.name;
END;
$$;


ALTER FUNCTION "public"."get_assigned_questionnaires_overview_for_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_provider_email_by_admin"("p_provider_id" "uuid") RETURNS TABLE("email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
    v_caller_uid uuid := auth.uid();
    v_caller_role public.app_role;
BEGIN
    -- Vérifier le rôle de l'appelant
    SELECT role INTO v_caller_role
    FROM public.user_roles
    WHERE user_id = v_caller_uid;

    IF v_caller_role IS NULL OR (v_caller_role NOT IN ('admin', 'superAdmin')) THEN
        RAISE EXCEPTION 'Permission denied: Only admins or superAdmins can perform this action.';
    END IF;

    -- Récupérer l'email du provider et le caster en TEXT
    RETURN QUERY
    SELECT u.email::text -- CAST u.email en text
    FROM auth.users u
    WHERE u.id = p_provider_id;
END;
$$;


ALTER FUNCTION "public"."get_provider_email_by_admin"("p_provider_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."provider_responses" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "answer" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_path" "text",
    "attachment_meta" "jsonb",
    "admin_score" integer,
    "admin_remark" "text",
    "clarity_status" "public"."clarity_status_enum" DEFAULT 'pending'::"public"."clarity_status_enum",
    "clarification_request_text" "text",
    "is_clarification_resolved" boolean DEFAULT false,
    "admin_clarity_status" "public"."admin_clarity_status_enum" DEFAULT 'pending_review'::"public"."admin_clarity_status_enum",
    "admin_internal_remark" "text",
    "admin_clarification_request" "text",
    "admin_reviewed_at" timestamp with time zone,
    "admin_reviewer_id" "uuid",
    CONSTRAINT "provider_responses_admin_score_check" CHECK ((("admin_score" IS NULL) OR (("admin_score" >= 0) AND ("admin_score" <= 5))))
);

ALTER TABLE ONLY "public"."provider_responses" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_responses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."provider_responses"."admin_remark" IS 'Internal remark from admin for this answer (not visible to provider)';



COMMENT ON COLUMN "public"."provider_responses"."clarity_status" IS 'Clarity status of the answer as assessed by admin (clear, not_clear, pending)';



COMMENT ON COLUMN "public"."provider_responses"."clarification_request_text" IS 'Text from admin requesting clarification for this specific answer (visible to provider)';



COMMENT ON COLUMN "public"."provider_responses"."is_clarification_resolved" IS 'Flag indicating if a requested clarification for this answer has been addressed/resolved';



CREATE OR REPLACE FUNCTION "public"."get_provider_latest_answers_for_questionnaire"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") RETURNS SETOF "public"."provider_responses"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT pr.*
    FROM public.provider_responses pr
    INNER JOIN (
        SELECT 
            pr_inner.question_id, 
            MAX(pr_inner.submitted_at) as max_submitted_at
        FROM public.provider_responses pr_inner
        WHERE pr_inner.questionnaire_id = p_questionnaire_id AND pr_inner.provider_id = p_provider_id
        GROUP BY pr_inner.question_id
    ) latest_pr
    ON pr.question_id = latest_pr.question_id AND pr.submitted_at = latest_pr.max_submitted_at
    WHERE pr.questionnaire_id = p_questionnaire_id AND pr.provider_id = p_provider_id;
END;
$$;


ALTER FUNCTION "public"."get_provider_latest_answers_for_questionnaire"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_submission_questions_for_admin_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") RETURNS TABLE("question_id" "uuid", "question_title" "text", "question_description" "text", "question_is_required" boolean, "question_order" integer, "provider_response_id" "uuid", "provider_answer" "text", "provider_attachment_path" "text", "provider_attachment_meta" "jsonb", "provider_response_submitted_at" timestamp with time zone, "current_admin_clarity_status" "public"."admin_clarity_status_enum", "current_admin_score" integer, "current_admin_internal_remark" "text", "current_admin_clarification_request" "text", "current_admin_reviewed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role public.app_role;
    q_ids UUID[];
    idx INTEGER;
BEGIN
    SELECT ur.role INTO v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_uid LIMIT 1;
    IF v_caller_role IS NULL OR (v_caller_role NOT IN ('admin', 'superAdmin')) THEN
        RAISE EXCEPTION 'Permission denied.';
    END IF;

    SELECT question_ids INTO q_ids FROM public.questionnaires WHERE id = p_questionnaire_id;

    IF q_ids IS NULL OR array_length(q_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH ordered_questions AS (
        SELECT q_id, ordinality as q_order -- q_order is bigint here
        FROM unnest(q_ids) WITH ORDINALITY AS t(q_id, ordinality)
    )
    SELECT
        oq.q_id AS question_id,
        q.title AS question_title,
        q.description AS question_description,
        TRUE AS question_is_required, 
        oq.q_order::integer AS question_order, -- CAST to integer
        pr.id AS provider_response_id,
        pr.answer AS provider_answer,
        pr.attachment_path AS provider_attachment_path,
        pr.attachment_meta AS provider_attachment_meta,
        pr.submitted_at AS provider_response_submitted_at,
        pr.admin_clarity_status AS current_admin_clarity_status,
        pr.admin_score AS current_admin_score,
        pr.admin_internal_remark AS current_admin_internal_remark,
        pr.admin_clarification_request AS current_admin_clarification_request,
        pr.admin_reviewed_at AS current_admin_reviewed_at
    FROM ordered_questions oq
    JOIN public.questions q ON q.id = oq.q_id
    LEFT JOIN public.provider_responses pr
        ON q.id = pr.question_id
        AND pr.provider_id = p_provider_id
        AND pr.questionnaire_id = p_questionnaire_id
    ORDER BY oq.q_order;
END;
$$;


ALTER FUNCTION "public"."get_submission_questions_for_admin_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_submitted_questionnaires_details_for_admin"() RETURNS TABLE("questionnaire_id" "uuid", "questionnaire_name" "text", "provider_id" "uuid", "provider_email" character varying, "status" "text", "submitted_at" timestamp with time zone, "notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id as questionnaire_id,
        q.name as questionnaire_name,
        pqs.provider_id,
        u.email, -- Pas besoin de cast ici
        pqs.status,
        pqs.submitted_at,
        (SELECT n.id FROM public.notifications n 
         WHERE n.questionnaire_id = q.id 
           AND n.submitted_by_provider_id = pqs.provider_id 
           AND n.title = 'Questionnaire Submitted'
         ORDER BY n.created_at DESC LIMIT 1) as notification_id
    FROM
        public.provider_questionnaire_status pqs
    JOIN
        public.questionnaires q ON pqs.questionnaire_id = q.id
    JOIN
        auth.users u ON pqs.provider_id = u.id
    WHERE
        pqs.status = 'submitted'
    ORDER BY
        pqs.submitted_at DESC, q.name;
END;
$$;


ALTER FUNCTION "public"."get_submitted_questionnaires_details_for_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_details_by_admin"("p_user_id_to_fetch" "uuid") RETURNS TABLE("id" "uuid", "email" character varying, "raw_user_meta_data" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
  v_caller_uid  uuid            := auth.uid();
  v_caller_role public.app_role;
BEGIN
  RAISE NOTICE '[get_user_details_by_admin] Starting execution. Caller UID: %', v_caller_uid;

  SELECT ur.role
    INTO v_caller_role
    FROM public.user_roles ur
   WHERE ur.user_id = v_caller_uid
   LIMIT 1;  -- au cas où, si vous gardez la garantie d’un seul rôle

  RAISE NOTICE '[get_user_details_by_admin] Role found for UID %: %', v_caller_uid, v_caller_role;

  IF v_caller_role IS NULL THEN
    RAISE NOTICE '[get_user_details_by_admin] No role found for Caller UID: %', v_caller_uid;
    RAISE EXCEPTION 'Permission denied: Caller role not found. UID: %', v_caller_uid;
  ELSIF v_caller_role NOT IN ('admin','superAdmin') THEN
    RAISE NOTICE '[get_user_details_by_admin] Insufficient role (%). UID: %', v_caller_role, v_caller_uid;
    RAISE EXCEPTION 'Permission denied: Caller is not an authorized administrator. UID: %, Role: %', v_caller_uid, v_caller_role;
  END IF;

  RAISE NOTICE '[get_user_details_by_admin] Permission check passed. Fetching details for user: %', p_user_id_to_fetch;

  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at, u.raw_user_meta_data AS user_metadata -- email casté en text si besoin, created_at ajouté
    FROM auth.users u
   WHERE u.id = p_user_id_to_fetch;
END;
$$;


ALTER FUNCTION "public"."get_user_details_by_admin"("p_user_id_to_fetch" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_by_role"("p_role" "public"."app_role") RETURNS TABLE("id" "uuid", "email" "text", "created_at" timestamp with time zone, "user_metadata" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data AS user_metadata
  FROM auth.users u
  JOIN public.user_roles ur ON u.id = ur.user_id
  WHERE ur.role = p_role;
$$;


ALTER FUNCTION "public"."get_users_by_role"("p_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."policy_exists"("p_table" "text", "p_policy" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename   = p_table
      AND policyname  = p_policy
  );
$$;


ALTER FUNCTION "public"."policy_exists"("p_table" "text", "p_policy" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_user_app_role"("p_user_id_to_revoke" "uuid", "p_role_being_revoked" "public"."app_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_caller_role public.app_role;
BEGIN
  -- Vérifier le rôle de l'appelant
  SELECT ur.role INTO v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_uid;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Permission denied: Caller role not found.';
  END IF;

  -- Logique de permission spécifique pour la révocation
  IF p_role_being_revoked = 'admin' THEN
    IF v_caller_role <> 'superAdmin' THEN
      RAISE EXCEPTION 'Permission denied: Only a superAdmin can revoke the admin role.';
    END IF;
  ELSIF p_role_being_revoked = 'provider' THEN
    IF v_caller_role NOT IN ('admin', 'superAdmin') THEN
      RAISE EXCEPTION 'Permission denied: Only an admin or superAdmin can revoke the provider role.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Permission denied: Role to be revoked is not recognized or not permitted for revocation by caller.';
  END IF;
  
  -- Empêcher un superAdmin de révoquer son propre rôle superAdmin (si vous avez une telle logique)
  -- ou un admin de révoquer son propre rôle admin via cette fonction (bien que la logique ci-dessus le couvre pour 'admin')
  IF v_caller_uid = p_user_id_to_revoke AND v_caller_role = p_role_being_revoked THEN
    RAISE EXCEPTION 'Action not allowed: Cannot revoke your own primary role through this function.';
  END IF;

  -- Procéder à la révocation
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id_to_revoke AND role = p_role_being_revoked;

  IF NOT FOUND THEN
    RAISE NOTICE 'User % did not have the role % to revoke, or user not found.', p_user_id_to_revoke, p_role_being_revoked;
    -- Vous pourriez choisir de lever une exception ici si le rôle devait exister
    -- EXCEPTION 'Role % not found for user % or user does not exist.', p_role_being_revoked, p_user_id_to_revoke;
  END IF;

  RAISE NOTICE 'Role % revoked for user % by caller % (Role: %)', p_role_being_revoked, p_user_id_to_revoke, v_caller_uid, v_caller_role;
END;
$$;


ALTER FUNCTION "public"."revoke_user_app_role"("p_user_id_to_revoke" "uuid", "p_role_being_revoked" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_admin_individual_question_review"("p_provider_response_id" "uuid", "p_clarity_status" "public"."admin_clarity_status_enum", "p_score" integer DEFAULT NULL::integer, "p_internal_remark" "text" DEFAULT NULL::"text", "p_clarification_request" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role public.app_role;
BEGIN
    SELECT ur.role INTO v_caller_role FROM public.user_roles ur WHERE ur.user_id = v_caller_uid LIMIT 1;

    IF v_caller_role IS NULL OR (v_caller_role NOT IN ('admin', 'superAdmin')) THEN
        RAISE EXCEPTION 'Permission denied: Caller is not an authorized administrator.';
    END IF;

    IF p_clarity_status = 'clear' AND (p_score IS NULL OR p_score < 0 OR p_score > 5) THEN
        RAISE EXCEPTION 'Invalid score. Score must be between 0 and 5 for a clear answer.';
    END IF;

    IF p_clarity_status = 'needs_clarification_requested' AND (p_clarification_request IS NULL OR TRIM(p_clarification_request) = '') THEN
        RAISE EXCEPTION 'Clarification request message cannot be empty.';
    END IF;

    UPDATE public.provider_responses
    SET
        admin_clarity_status = p_clarity_status,
        admin_score = CASE WHEN p_clarity_status = 'clear' THEN p_score ELSE NULL END,
        admin_internal_remark = CASE WHEN p_clarity_status = 'clear' THEN p_internal_remark ELSE NULL END,
        admin_clarification_request = CASE WHEN p_clarity_status = 'needs_clarification_requested' THEN p_clarification_request ELSE NULL END,
        admin_reviewed_at = NOW(),
        admin_reviewer_id = v_caller_uid
    WHERE id = p_provider_response_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provider response with ID % not found.', p_provider_response_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."save_admin_individual_question_review"("p_provider_response_id" "uuid", "p_clarity_status" "public"."admin_clarity_status_enum", "p_score" integer, "p_internal_remark" "text", "p_clarification_request" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_provider_questionnaire_progress"("p_questionnaire_id" "uuid", "p_answers" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_provider_id UUID := auth.uid();
    v_answer_item JSONB;
    v_question_id_item UUID;
    v_answer_text_item TEXT;
    v_attachment_path_item TEXT;
    v_attachment_meta_item JSONB;
    v_current_response_id UUID;
BEGIN
    FOR v_answer_item IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
        v_question_id_item := (v_answer_item->>'question_id')::UUID;
        v_answer_text_item := v_answer_item->>'answer';
        v_attachment_path_item := v_answer_item->>'attachment_path';
        
        IF v_answer_item->>'attachment_meta' IS NOT NULL AND TRIM(v_answer_item->>'attachment_meta') <> '' THEN
            BEGIN
                v_attachment_meta_item := (v_answer_item->>'attachment_meta')::JSONB;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE WARNING 'Invalid JSON for attachment_meta in save_progress for QID %: %. Setting to NULL.', 
                              v_question_id_item, v_answer_item->>'attachment_meta';
                v_attachment_meta_item := NULL;
            END;
        ELSE
            v_attachment_meta_item := NULL;
        END IF;

        INSERT INTO public.provider_responses (
            questionnaire_id, question_id, provider_id, answer, 
            submitted_at, attachment_path, attachment_meta,
            admin_clarity_status 
        )
        VALUES (
            p_questionnaire_id, v_question_id_item, v_provider_id, v_answer_text_item,
            NOW(), v_attachment_path_item, v_attachment_meta_item,
            'pending_review'::public.admin_clarity_status_enum
        )
        ON CONFLICT (questionnaire_id, question_id, provider_id) DO UPDATE SET
            answer = EXCLUDED.answer,
            submitted_at = EXCLUDED.submitted_at,
            attachment_path = EXCLUDED.attachment_path,
            attachment_meta = EXCLUDED.attachment_meta,
            admin_clarity_status = 'pending_review'::public.admin_clarity_status_enum,
            admin_score = NULL, admin_internal_remark = NULL, admin_clarification_request = NULL,
            admin_reviewed_at = NULL, admin_reviewer_id = NULL
        RETURNING id INTO v_current_response_id;

        INSERT INTO public.provider_response_versions (
            provider_response_id, questionnaire_id, question_id, provider_id, 
            answer, attachment_path, attachment_meta, 
            modified_by_user_id, modified_at
        )
        VALUES (
            v_current_response_id, p_questionnaire_id, v_question_id_item, v_provider_id,
            v_answer_text_item, v_attachment_path_item, v_attachment_meta_item,
            v_provider_id, NOW()
        );
    END LOOP;

    UPDATE public.provider_questionnaire_status
    SET status = 'in_progress', last_saved_at = NOW()
    WHERE questionnaire_id = p_questionnaire_id 
      AND provider_id = v_provider_id
      AND status NOT IN ('submitted', 'reviewed', 'needs_clarification');

    IF NOT FOUND THEN
        INSERT INTO public.provider_questionnaire_status (questionnaire_id, provider_id, status, last_saved_at, review_status)
        SELECT p_questionnaire_id, v_provider_id, 'in_progress', NOW(), 'pending'::public.review_status_enum
        WHERE NOT EXISTS (
            SELECT 1 FROM public.provider_questionnaire_status
            WHERE questionnaire_id = p_questionnaire_id AND provider_id = v_provider_id
        )
        ON CONFLICT (questionnaire_id, provider_id) DO UPDATE
        SET status = 'in_progress', last_saved_at = NOW()
        WHERE provider_questionnaire_status.status NOT IN ('submitted', 'reviewed', 'needs_clarification');
    END IF;

    RAISE NOTICE 'Progress saved for questionnaire_id: %, provider_id: %', p_questionnaire_id, v_provider_id;
END;
$$;


ALTER FUNCTION "public"."save_provider_questionnaire_progress"("p_questionnaire_id" "uuid", "p_answers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_provider_single_answer"("p_questionnaire_id" "uuid", "p_question_id" "uuid", "p_answer" "text", "p_attachment_path" "text" DEFAULT NULL::"text", "p_attachment_meta" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_provider_id UUID := auth.uid();
    v_current_response_id UUID;
    v_response_payload JSONB;
BEGIN
    INSERT INTO public.provider_responses (
        questionnaire_id, question_id, provider_id, answer, 
        submitted_at, attachment_path, attachment_meta,
        admin_clarity_status 
    )
    VALUES (
        p_questionnaire_id, p_question_id, v_provider_id, p_answer,
        NOW(), p_attachment_path, p_attachment_meta,
        'pending_review'::public.admin_clarity_status_enum
    )
    ON CONFLICT (questionnaire_id, question_id, provider_id) DO UPDATE SET
        answer = EXCLUDED.answer,
        submitted_at = EXCLUDED.submitted_at,
        attachment_path = EXCLUDED.attachment_path,
        attachment_meta = EXCLUDED.attachment_meta,
        admin_clarity_status = 'pending_review'::public.admin_clarity_status_enum,
        admin_score = NULL, admin_internal_remark = NULL, admin_clarification_request = NULL,
        admin_reviewed_at = NULL, admin_reviewer_id = NULL
    RETURNING id INTO v_current_response_id;

    INSERT INTO public.provider_response_versions (
        provider_response_id, questionnaire_id, question_id, provider_id, 
        answer, attachment_path, attachment_meta, 
        modified_by_user_id, modified_at
    )
    VALUES (
        v_current_response_id, p_questionnaire_id, p_question_id, v_provider_id,
        p_answer, p_attachment_path, p_attachment_meta,
        v_provider_id, NOW()
    );

    UPDATE public.provider_questionnaire_status
    SET status = 'in_progress', last_saved_at = NOW()
    WHERE questionnaire_id = p_questionnaire_id
      AND provider_id = v_provider_id
      AND status NOT IN ('submitted', 'reviewed', 'needs_clarification');

    IF NOT FOUND THEN
        INSERT INTO public.provider_questionnaire_status (questionnaire_id, provider_id, status, last_saved_at, review_status)
        SELECT p_questionnaire_id, v_provider_id, 'in_progress', NOW(), 'pending'::public.review_status_enum
        WHERE NOT EXISTS (
            SELECT 1 FROM public.provider_questionnaire_status
            WHERE questionnaire_id = p_questionnaire_id AND provider_id = v_provider_id
        )
        ON CONFLICT (questionnaire_id, provider_id) DO UPDATE
        SET status = 'in_progress', last_saved_at = NOW()
        WHERE provider_questionnaire_status.status NOT IN ('submitted', 'reviewed', 'needs_clarification');
    END IF;
    
    SELECT jsonb_build_object(
        'id', pr.id, 'questionnaire_id', pr.questionnaire_id, 'question_id', pr.question_id,
        'provider_id', pr.provider_id, 'answer', pr.answer, 'submitted_at', pr.submitted_at,
        'attachment_path', pr.attachment_path, 'attachment_meta', pr.attachment_meta
    ) INTO v_response_payload
    FROM public.provider_responses pr
    WHERE pr.id = v_current_response_id;

    RETURN v_response_payload;
END;
$$;


ALTER FUNCTION "public"."save_provider_single_answer"("p_questionnaire_id" "uuid", "p_question_id" "uuid", "p_answer" "text", "p_attachment_path" "text", "p_attachment_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_questions_for_questionnaire"("p_questionnaire" "uuid", "p_question_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  update questionnaires
  set question_ids = p_question_ids,
      updated_at   = now()
  where id = p_questionnaire;
end;
$$;


ALTER FUNCTION "public"."set_questions_for_questionnaire"("p_questionnaire" "uuid", "p_question_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_questionnaire_answers_and_notify_admins"("p_questionnaire_id" "uuid", "p_answers" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
    v_provider_id UUID := auth.uid();
    v_answer_item JSONB;
    v_question_id_item UUID;
    v_answer_text_item TEXT;
    v_attachment_path_item TEXT;
    v_attachment_meta_item JSONB;
    v_current_response_id UUID;
    v_admin_user RECORD;
    v_questionnaire_name TEXT;
    v_provider_email TEXT;
    v_previous_review_status public.review_status_enum;
BEGIN
    SELECT name INTO v_questionnaire_name FROM public.questionnaires WHERE id = p_questionnaire_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Questionnaire not found: %', p_questionnaire_id; END IF;

    SELECT email INTO v_provider_email FROM auth.users WHERE id = v_provider_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider user not found: %', v_provider_id; END IF;

    SELECT review_status INTO v_previous_review_status
    FROM public.provider_questionnaire_status
    WHERE questionnaire_id = p_questionnaire_id AND provider_id = v_provider_id;
    
    FOR v_answer_item IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
        v_question_id_item := (v_answer_item->>'question_id')::UUID;
        v_answer_text_item := v_answer_item->>'answer';
        v_attachment_path_item := v_answer_item->>'attachment_path';

        IF v_answer_item->>'attachment_meta' IS NOT NULL AND TRIM(v_answer_item->>'attachment_meta') <> '' THEN
            BEGIN
                v_attachment_meta_item := (v_answer_item->>'attachment_meta')::JSONB;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE WARNING 'Invalid JSON for attachment_meta in submit_answers for QID %: %. Setting to NULL.', 
                              v_question_id_item, v_answer_item->>'attachment_meta';
                v_attachment_meta_item := NULL;
            END;
        ELSE
            v_attachment_meta_item := NULL;
        END IF;

        INSERT INTO public.provider_responses (
            questionnaire_id, question_id, provider_id, answer, 
            submitted_at, attachment_path, attachment_meta,
            admin_clarity_status, admin_score, admin_internal_remark, 
            admin_clarification_request, admin_reviewed_at, admin_reviewer_id
        )
        VALUES (
            p_questionnaire_id, v_question_id_item, v_provider_id, v_answer_text_item,
            NOW(), v_attachment_path_item, v_attachment_meta_item,
            'pending_review'::public.admin_clarity_status_enum, NULL, NULL, NULL, NULL, NULL
        )
        ON CONFLICT (questionnaire_id, question_id, provider_id) DO UPDATE SET
            answer = EXCLUDED.answer,
            submitted_at = EXCLUDED.submitted_at,
            attachment_path = EXCLUDED.attachment_path,
            attachment_meta = EXCLUDED.attachment_meta,
            admin_clarity_status = 'pending_review'::public.admin_clarity_status_enum,
            admin_score = NULL, admin_internal_remark = NULL, admin_clarification_request = NULL,
            admin_reviewed_at = NULL, admin_reviewer_id = NULL
        RETURNING id INTO v_current_response_id;

        INSERT INTO public.provider_response_versions (
            provider_response_id, questionnaire_id, question_id, provider_id, 
            answer, attachment_path, attachment_meta, 
            modified_by_user_id, modified_at
        )
        VALUES (
            v_current_response_id, p_questionnaire_id, v_question_id_item, v_provider_id,
            v_answer_text_item, v_attachment_path_item, v_attachment_meta_item,
            v_provider_id, NOW()
        );
    END LOOP;

    UPDATE public.provider_questionnaire_status
    SET
        status = 'submitted'::text,
        submitted_at = NOW(),
        last_saved_at = NOW(),
        review_status = CASE
                            WHEN v_previous_review_status = 'needs_clarification'::public.review_status_enum THEN 'clarification_provided'::public.review_status_enum
                            ELSE 'pending'::public.review_status_enum
                        END,
        score = NULL, 
        review_comment = CASE 
                            WHEN v_previous_review_status = 'needs_clarification'::public.review_status_enum THEN review_comment 
                            ELSE NULL
                         END,
        reviewed_at = NULL,
        reviewed_by_admin_id = NULL
    WHERE questionnaire_id = p_questionnaire_id AND provider_id = v_provider_id;

    IF NOT FOUND THEN
        INSERT INTO public.provider_questionnaire_status
            (questionnaire_id, provider_id, status, submitted_at, last_saved_at, review_status)
        VALUES
            (p_questionnaire_id, v_provider_id, 'submitted'::text, NOW(), NOW(), 'pending'::public.review_status_enum);
    END IF;

    FOR v_admin_user IN SELECT ur.user_id as id FROM public.user_roles ur WHERE ur.role IN ('admin', 'superAdmin') LOOP
        INSERT INTO public.notifications (
            user_id, questionnaire_id, submitted_by_provider_id, title, body, type, created_at
        ) VALUES (
            v_admin_user.id, p_questionnaire_id, v_provider_id,
            'Questionnaire Soumis: ' || COALESCE(v_questionnaire_name, 'N/A'),
            format('Le fournisseur %s (%s) a soumis le questionnaire "%s".', v_provider_id, COALESCE(v_provider_email, 'N/A'), COALESCE(v_questionnaire_name, 'N/A')),
            'questionnaire_submitted', NOW()
        );
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."submit_questionnaire_answers_and_notify_admins"("p_questionnaire_id" "uuid", "p_answers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_metadata_to_user_roles_table"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role public.app_role;
  v_metadata_role TEXT := NEW.raw_user_meta_data->>'role';
  v_user_id UUID := NEW.id;
BEGIN
  -- Déterminer le rôle à attribuer
  IF v_metadata_role IS NULL OR v_metadata_role = '' THEN
    -- Assigner 'superAdmin' par défaut pour les utilisateurs créés via dashboard
    RAISE NOTICE 'Assigning default role "superAdmin" for user %', v_user_id;
    v_role := 'superAdmin'::public.app_role;
  ELSE
    -- Convertir le texte en enum avec gestion d'erreur
    BEGIN
      v_role := v_metadata_role::public.app_role;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE WARNING 'Invalid role value "%" in metadata for user %. Defaulting to "provider"', 
                    v_metadata_role, v_user_id;
      v_role := 'provider'::public.app_role;
    END;
  END IF;

  -- Insérer ou mettre à jour dans user_roles
  INSERT INTO public.user_roles (user_id, role, created_at, updated_at)
  VALUES (
    v_user_id,
    v_role,
    COALESCE(NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = NOW();

  -- Mettre à jour les métadonnées utilisateur pour refléter le rôle effectif
  -- Cette étape est cruciale pour garantir la cohérence entre auth.users et user_roles
  IF v_metadata_role IS NULL OR v_metadata_role = '' OR v_metadata_role <> v_role::TEXT THEN
    UPDATE auth.users
    SET raw_user_meta_data = 
      CASE 
        WHEN raw_user_meta_data IS NULL THEN 
          jsonb_build_object('role', v_role::text)
        ELSE 
          raw_user_meta_data || jsonb_build_object('role', v_role::text)
      END
    WHERE id = v_user_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_metadata_to_user_roles_table"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_metadata_by_admin"("p_user_id_to_update" "uuid", "p_new_metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'auth'
    AS $$
DECLARE
  v_caller_uid  uuid            := auth.uid();
  v_caller_role public.app_role;
BEGIN
  -- Vérifier si l'appelant est autorisé (admin ou superAdmin)
  SELECT role
    INTO v_caller_role
    FROM public.user_roles
   WHERE user_id = v_caller_uid
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_caller_role IS NULL
     OR (v_caller_role <> 'admin' AND v_caller_role <> 'superAdmin')
  THEN
    RAISE EXCEPTION
      'Permission denied: Caller is not an authorized administrator to update user metadata.';
  END IF;

  -- Mettre à jour les métadonnées de l'utilisateur dans auth.users
  UPDATE auth.users
     SET raw_user_meta_data = p_new_metadata
   WHERE id = p_user_id_to_update;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'User with ID % not found for metadata update.',
      p_user_id_to_update;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_user_metadata_by_admin"("p_user_id_to_update" "uuid", "p_new_metadata" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text",
    "status" "text" DEFAULT 'unread'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "questionnaire_id" "uuid",
    "read_at" timestamp with time zone,
    "submitted_by_provider_id" "uuid",
    "content" "text",
    "type" "text"
);

ALTER TABLE ONLY "public"."notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_questionnaire_status" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_saved_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "score" integer,
    "review_comment" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by_admin_id" "uuid",
    "review_status" "public"."review_status_enum" DEFAULT 'pending'::"public"."review_status_enum",
    CONSTRAINT "provider_questionnaire_status_score_check" CHECK ((("score" IS NULL) OR (("score" >= 0) AND ("score" <= 5))))
);


ALTER TABLE "public"."provider_questionnaire_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_response_versions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "provider_response_id" "uuid" NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "provider_id" "uuid" NOT NULL,
    "answer" "text",
    "attachment_path" "text",
    "attachment_meta" "jsonb",
    "modified_by_user_id" "uuid" NOT NULL,
    "modified_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."provider_response_versions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_response_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_response_versions" IS 'Stores historical versions of provider responses to questions.';



COMMENT ON COLUMN "public"."provider_response_versions"."provider_response_id" IS 'FK to the current/latest provider_responses.id for this question answer.';



COMMENT ON COLUMN "public"."provider_response_versions"."modified_by_user_id" IS 'User ID of the provider who made this version of the answer.';



CREATE TABLE IF NOT EXISTS "public"."questionnaires" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "question_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "provider_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."questionnaires" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."user_roles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_questionnaire_status"
    ADD CONSTRAINT "provider_questionnaire_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_questionnaire_status"
    ADD CONSTRAINT "provider_questionnaire_status_questionnaire_id_provider_id_key" UNIQUE ("questionnaire_id", "provider_id");



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_qnr_id_q_id_provider_id_key" UNIQUE ("questionnaire_id", "question_id", "provider_id");



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_notif_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_pr_versions_modified_at" ON "public"."provider_response_versions" USING "btree" ("modified_at" DESC);



CREATE INDEX "idx_pr_versions_q_q_p" ON "public"."provider_response_versions" USING "btree" ("questionnaire_id", "question_id", "provider_id");



CREATE INDEX "idx_pr_versions_response_id" ON "public"."provider_response_versions" USING "btree" ("provider_response_id");



CREATE INDEX "idx_provider_responses_provider_id" ON "public"."provider_responses" USING "btree" ("provider_id");



CREATE INDEX "idx_provider_responses_qnr_id" ON "public"."provider_responses" USING "btree" ("questionnaire_id");



CREATE INDEX "idx_provider_responses_question_id" ON "public"."provider_responses" USING "btree" ("question_id");



CREATE INDEX "idx_provider_responses_submitted_at" ON "public"."provider_responses" USING "btree" ("submitted_at" DESC);



CREATE INDEX "idx_qn_provider_ids" ON "public"."questionnaires" USING "gin" ("provider_ids");



CREATE INDEX "idx_qn_question_ids" ON "public"."questionnaires" USING "gin" ("question_ids");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "Send_Email_on_New_Notification" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xglcflsutwumatgpbxkn.supabase.co/functions/v1/handle-email-sending', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGNmbHN1dHd1bWF0Z3BieGtuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Nzk2NjgwNSwiZXhwIjoyMDYzNTQyODA1fQ.Z2Z0Ac92YgEz3DraawRduEQVYE50qRnUgqUs-u2eZfk"}', '{}', '5000');



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_submitted_by_provider_id_fkey" FOREIGN KEY ("submitted_by_provider_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_questionnaire_status"
    ADD CONSTRAINT "provider_questionnaire_status_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_questionnaire_status"
    ADD CONSTRAINT "provider_questionnaire_status_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_questionnaire_status"
    ADD CONSTRAINT "provider_questionnaire_status_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_modified_by_user_id_fkey" FOREIGN KEY ("modified_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_provider_response_id_fkey" FOREIGN KEY ("provider_response_id") REFERENCES "public"."provider_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_response_versions"
    ADD CONSTRAINT "provider_response_versions_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_admin_reviewer_id_fkey" FOREIGN KEY ("admin_reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_responses"
    ADD CONSTRAINT "provider_responses_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admin_can_read_all_user_roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur_checker"
  WHERE (("ur_checker"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur_checker"."role" = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"]))))));



CREATE POLICY "admin_read_all_provider_questionnaire_statuses" ON "public"."provider_questionnaire_status" FOR SELECT TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "admin_read_all_response_versions" ON "public"."provider_response_versions" FOR SELECT TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "admin_read_all_responses" ON "public"."provider_responses" FOR SELECT TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "admin_update_all_provider_questionnaire_statuses" ON "public"."provider_questionnaire_status" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"]))) WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "admin_update_responses" ON "public"."provider_responses" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"]))) WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "admins_delete_provider_roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING (((( SELECT "public"."current_app_role"() AS "current_app_role") = 'admin'::"public"."app_role") AND ("role" = 'provider'::"public"."app_role")));



CREATE POLICY "admins_insert_provider_roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "public"."current_app_role"() AS "current_app_role") = 'admin'::"public"."app_role") AND ("role" = 'provider'::"public"."app_role")));



CREATE POLICY "admins_update_provider_roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING (((( SELECT "public"."current_app_role"() AS "current_app_role") = 'admin'::"public"."app_role") AND ("role" = 'provider'::"public"."app_role"))) WITH CHECK (((( SELECT "public"."current_app_role"() AS "current_app_role") = 'admin'::"public"."app_role") AND ("role" = 'provider'::"public"."app_role")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_insert_own_responses" ON "public"."provider_responses" FOR INSERT TO "authenticated" WITH CHECK (("provider_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."provider_questionnaire_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "provider_read_own_questionnaire_statuses" ON "public"."provider_questionnaire_status" FOR SELECT TO "authenticated" USING (("provider_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "provider_read_own_response_versions" ON "public"."provider_response_versions" FOR SELECT TO "authenticated" USING (("provider_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "provider_read_own_responses" ON "public"."provider_responses" FOR SELECT TO "authenticated" USING (("provider_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."provider_response_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaires" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "questionnaires_access_policy" ON "public"."questionnaires" TO "authenticated" USING (((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])) OR ((( SELECT "public"."current_app_role"() AS "current_app_role") = 'provider'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."provider_questionnaire_status" "pqs"
  WHERE (("pqs"."questionnaire_id" = "questionnaires"."id") AND ("pqs"."provider_id" = ( SELECT "auth"."uid"() AS "uid")))))))) WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "questions_access_policy" ON "public"."questions" TO "authenticated" USING (((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])) OR (( SELECT "public"."current_app_role"() AS "current_app_role") = 'provider'::"public"."app_role"))) WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = ANY (ARRAY['admin'::"public"."app_role", 'superAdmin'::"public"."app_role"])));



CREATE POLICY "superadmins_delete_all" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = 'superAdmin'::"public"."app_role"));



CREATE POLICY "superadmins_insert_all" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = 'superAdmin'::"public"."app_role"));



CREATE POLICY "superadmins_update_all" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."current_app_role"() AS "current_app_role") = 'superAdmin'::"public"."app_role")) WITH CHECK ((( SELECT "public"."current_app_role"() AS "current_app_role") = 'superAdmin'::"public"."app_role"));



CREATE POLICY "user_can_read_own_role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_read_own_notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_update_own_notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_finalize_detailed_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_detailed_reviews" "jsonb", "p_global_questionnaire_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_finalize_detailed_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_detailed_reviews" "jsonb", "p_global_questionnaire_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_finalize_detailed_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_detailed_reviews" "jsonb", "p_global_questionnaire_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_finalize_submission_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_global_review_comment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_finalize_submission_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_global_review_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_finalize_submission_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid", "p_global_review_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_questionnaire_to_providers"("p_questionnaire" "uuid", "p_providers" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_questionnaire_to_providers"("p_questionnaire" "uuid", "p_providers" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_questionnaire_to_providers"("p_questionnaire" "uuid", "p_providers" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_review_submissions_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_review_submissions_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_review_submissions_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_assigned_questionnaires_overview_for_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_assigned_questionnaires_overview_for_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_assigned_questionnaires_overview_for_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_provider_email_by_admin"("p_provider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_provider_email_by_admin"("p_provider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_provider_email_by_admin"("p_provider_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."provider_responses" TO "anon";
GRANT ALL ON TABLE "public"."provider_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_responses" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_provider_latest_answers_for_questionnaire"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_provider_latest_answers_for_questionnaire"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_provider_latest_answers_for_questionnaire"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_submission_questions_for_admin_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_submission_questions_for_admin_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_submission_questions_for_admin_review"("p_questionnaire_id" "uuid", "p_provider_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_submitted_questionnaires_details_for_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_submitted_questionnaires_details_for_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_submitted_questionnaires_details_for_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_details_by_admin"("p_user_id_to_fetch" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_details_by_admin"("p_user_id_to_fetch" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_details_by_admin"("p_user_id_to_fetch" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_by_role"("p_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_by_role"("p_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_by_role"("p_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."policy_exists"("p_table" "text", "p_policy" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."policy_exists"("p_table" "text", "p_policy" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."policy_exists"("p_table" "text", "p_policy" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_user_app_role"("p_user_id_to_revoke" "uuid", "p_role_being_revoked" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_user_app_role"("p_user_id_to_revoke" "uuid", "p_role_being_revoked" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_user_app_role"("p_user_id_to_revoke" "uuid", "p_role_being_revoked" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_admin_individual_question_review"("p_provider_response_id" "uuid", "p_clarity_status" "public"."admin_clarity_status_enum", "p_score" integer, "p_internal_remark" "text", "p_clarification_request" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_admin_individual_question_review"("p_provider_response_id" "uuid", "p_clarity_status" "public"."admin_clarity_status_enum", "p_score" integer, "p_internal_remark" "text", "p_clarification_request" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_admin_individual_question_review"("p_provider_response_id" "uuid", "p_clarity_status" "public"."admin_clarity_status_enum", "p_score" integer, "p_internal_remark" "text", "p_clarification_request" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_provider_questionnaire_progress"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_provider_questionnaire_progress"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_provider_questionnaire_progress"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_provider_single_answer"("p_questionnaire_id" "uuid", "p_question_id" "uuid", "p_answer" "text", "p_attachment_path" "text", "p_attachment_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_provider_single_answer"("p_questionnaire_id" "uuid", "p_question_id" "uuid", "p_answer" "text", "p_attachment_path" "text", "p_attachment_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_provider_single_answer"("p_questionnaire_id" "uuid", "p_question_id" "uuid", "p_answer" "text", "p_attachment_path" "text", "p_attachment_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_questions_for_questionnaire"("p_questionnaire" "uuid", "p_question_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_questions_for_questionnaire"("p_questionnaire" "uuid", "p_question_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_questions_for_questionnaire"("p_questionnaire" "uuid", "p_question_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_questionnaire_answers_and_notify_admins"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_questionnaire_answers_and_notify_admins"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_questionnaire_answers_and_notify_admins"("p_questionnaire_id" "uuid", "p_answers" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_metadata_to_user_roles_table"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_metadata_to_user_roles_table"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_metadata_to_user_roles_table"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_metadata_by_admin"("p_user_id_to_update" "uuid", "p_new_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_metadata_by_admin"("p_user_id_to_update" "uuid", "p_new_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_metadata_by_admin"("p_user_id_to_update" "uuid", "p_new_metadata" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."provider_questionnaire_status" TO "anon";
GRANT ALL ON TABLE "public"."provider_questionnaire_status" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_questionnaire_status" TO "service_role";



GRANT ALL ON TABLE "public"."provider_response_versions" TO "anon";
GRANT ALL ON TABLE "public"."provider_response_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_response_versions" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaires" TO "anon";
GRANT ALL ON TABLE "public"."questionnaires" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaires" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






RESET ALL;
