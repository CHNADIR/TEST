export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      notifications: {
        Row: {
          body: string | null
          content: string | null
          created_at: string
          id: string
          questionnaire_id: string | null
          read_at: string | null
          status: string | null
          submitted_by_provider_id: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          content?: string | null
          created_at?: string
          id?: string
          questionnaire_id?: string | null
          read_at?: string | null
          status?: string | null
          submitted_by_provider_id?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          content?: string | null
          created_at?: string
          id?: string
          questionnaire_id?: string | null
          read_at?: string | null
          status?: string | null
          submitted_by_provider_id?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_questionnaire_status: {
        Row: {
          created_at: string | null
          id: string
          last_saved_at: string | null
          provider_id: string
          questionnaire_id: string
          review_comment: string | null
          review_status:
            | Database["public"]["Enums"]["review_status_enum"]
            | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          score: number | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_saved_at?: string | null
          provider_id: string
          questionnaire_id: string
          review_comment?: string | null
          review_status?:
            | Database["public"]["Enums"]["review_status_enum"]
            | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          score?: number | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_saved_at?: string | null
          provider_id?: string
          questionnaire_id?: string
          review_comment?: string | null
          review_status?:
            | Database["public"]["Enums"]["review_status_enum"]
            | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          score?: number | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_questionnaire_status_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_response_versions: {
        Row: {
          answer: string | null
          attachment_meta: Json | null
          attachment_path: string | null
          id: string
          modified_at: string
          modified_by_user_id: string
          provider_id: string
          provider_response_id: string
          question_id: string
          questionnaire_id: string
        }
        Insert: {
          answer?: string | null
          attachment_meta?: Json | null
          attachment_path?: string | null
          id?: string
          modified_at?: string
          modified_by_user_id: string
          provider_id: string
          provider_response_id: string
          question_id: string
          questionnaire_id: string
        }
        Update: {
          answer?: string | null
          attachment_meta?: Json | null
          attachment_path?: string | null
          id?: string
          modified_at?: string
          modified_by_user_id?: string
          provider_id?: string
          provider_response_id?: string
          question_id?: string
          questionnaire_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_response_versions_provider_response_id_fkey"
            columns: ["provider_response_id"]
            isOneToOne: false
            referencedRelation: "provider_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_response_versions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_response_versions_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_responses: {
        Row: {
          admin_clarification_request: string | null
          admin_clarity_status:
            | Database["public"]["Enums"]["admin_clarity_status_enum"]
            | null
          admin_internal_remark: string | null
          admin_remark: string | null
          admin_reviewed_at: string | null
          admin_reviewer_id: string | null
          admin_score: number | null
          answer: string | null
          attachment_meta: Json | null
          attachment_path: string | null
          clarification_request_text: string | null
          clarity_status:
            | Database["public"]["Enums"]["clarity_status_enum"]
            | null
          id: string
          is_clarification_resolved: boolean | null
          provider_id: string
          question_id: string
          questionnaire_id: string
          submitted_at: string
        }
        Insert: {
          admin_clarification_request?: string | null
          admin_clarity_status?:
            | Database["public"]["Enums"]["admin_clarity_status_enum"]
            | null
          admin_internal_remark?: string | null
          admin_remark?: string | null
          admin_reviewed_at?: string | null
          admin_reviewer_id?: string | null
          admin_score?: number | null
          answer?: string | null
          attachment_meta?: Json | null
          attachment_path?: string | null
          clarification_request_text?: string | null
          clarity_status?:
            | Database["public"]["Enums"]["clarity_status_enum"]
            | null
          id?: string
          is_clarification_resolved?: boolean | null
          provider_id: string
          question_id: string
          questionnaire_id: string
          submitted_at?: string
        }
        Update: {
          admin_clarification_request?: string | null
          admin_clarity_status?:
            | Database["public"]["Enums"]["admin_clarity_status_enum"]
            | null
          admin_internal_remark?: string | null
          admin_remark?: string | null
          admin_reviewed_at?: string | null
          admin_reviewer_id?: string | null
          admin_score?: number | null
          answer?: string | null
          attachment_meta?: Json | null
          attachment_path?: string | null
          clarification_request_text?: string | null
          clarity_status?:
            | Database["public"]["Enums"]["clarity_status_enum"]
            | null
          id?: string
          is_clarification_resolved?: boolean | null
          provider_id?: string
          question_id?: string
          questionnaire_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_responses_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaires: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          provider_ids: string[]
          question_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          provider_ids?: string[]
          question_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          provider_ids?: string[]
          question_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_finalize_detailed_review: {
        Args: {
          p_questionnaire_id: string
          p_provider_id: string
          p_detailed_reviews: Json
          p_global_questionnaire_comment?: string
        }
        Returns: undefined
      }
      admin_finalize_submission_review: {
        Args: {
          p_questionnaire_id: string
          p_provider_id: string
          p_global_review_comment?: string
        }
        Returns: undefined
      }
      assign_questionnaire_to_providers: {
        Args: { p_questionnaire: string; p_providers: string[] }
        Returns: undefined
      }
      current_app_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_admin_review_submissions_list: {
        Args: Record<PropertyKey, never>
        Returns: {
          questionnaire_id: string
          questionnaire_name: string
          provider_id: string
          provider_email: string
          submission_id: string
          submitted_at: string
          review_status: Database["public"]["Enums"]["review_status_enum"]
          global_status: string
        }[]
      }
      get_assigned_questionnaires_overview_for_admin: {
        Args: Record<PropertyKey, never>
        Returns: {
          questionnaire_id: string
          questionnaire_name: string
          provider_id: string
          provider_email: string
          status: string
          last_saved_at: string
          submitted_at: string
          assigned_at: string
        }[]
      }
      get_provider_email_by_admin: {
        Args: { p_provider_id: string }
        Returns: {
          email: string
        }[]
      }
      get_provider_latest_answers_for_questionnaire: {
        Args: { p_questionnaire_id: string; p_provider_id: string }
        Returns: {
          admin_clarification_request: string | null
          admin_clarity_status:
            | Database["public"]["Enums"]["admin_clarity_status_enum"]
            | null
          admin_internal_remark: string | null
          admin_remark: string | null
          admin_reviewed_at: string | null
          admin_reviewer_id: string | null
          admin_score: number | null
          answer: string | null
          attachment_meta: Json | null
          attachment_path: string | null
          clarification_request_text: string | null
          clarity_status:
            | Database["public"]["Enums"]["clarity_status_enum"]
            | null
          id: string
          is_clarification_resolved: boolean | null
          provider_id: string
          question_id: string
          questionnaire_id: string
          submitted_at: string
        }[]
      }
      get_submission_questions_for_admin_review: {
        Args: { p_questionnaire_id: string; p_provider_id: string }
        Returns: {
          question_id: string
          question_title: string
          question_description: string
          question_is_required: boolean
          question_order: number
          provider_response_id: string
          provider_answer: string
          provider_attachment_path: string
          provider_attachment_meta: Json
          provider_response_submitted_at: string
          current_admin_clarity_status: Database["public"]["Enums"]["admin_clarity_status_enum"]
          current_admin_score: number
          current_admin_internal_remark: string
          current_admin_clarification_request: string
          current_admin_reviewed_at: string
        }[]
      }
      get_submitted_questionnaires_details_for_admin: {
        Args: Record<PropertyKey, never>
        Returns: {
          questionnaire_id: string
          questionnaire_name: string
          provider_id: string
          provider_email: string
          status: string
          submitted_at: string
          notification_id: string
        }[]
      }
      get_user_details_by_admin: {
        Args: { p_user_id_to_fetch: string }
        Returns: {
          id: string
          email: string
          raw_user_meta_data: Json
          created_at: string
        }[]
      }
      get_users_by_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: {
          id: string
          email: string
          created_at: string
          user_metadata: Json
        }[]
      }
      policy_exists: {
        Args: { p_table: string; p_policy: string }
        Returns: boolean
      }
      revoke_user_app_role: {
        Args: {
          p_user_id_to_revoke: string
          p_role_being_revoked: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      save_admin_individual_question_review: {
        Args: {
          p_provider_response_id: string
          p_clarity_status: Database["public"]["Enums"]["admin_clarity_status_enum"]
          p_score?: number
          p_internal_remark?: string
          p_clarification_request?: string
        }
        Returns: undefined
      }
      save_provider_questionnaire_progress: {
        Args: { p_questionnaire_id: string; p_answers: Json }
        Returns: undefined
      }
      save_provider_single_answer: {
        Args: {
          p_questionnaire_id: string
          p_question_id: string
          p_answer: string
          p_attachment_path?: string
          p_attachment_meta?: Json
        }
        Returns: Json
      }
      set_questions_for_questionnaire: {
        Args: { p_questionnaire: string; p_question_ids: string[] }
        Returns: undefined
      }
      submit_questionnaire_answers_and_notify_admins: {
        Args: { p_questionnaire_id: string; p_answers: Json }
        Returns: undefined
      }
      update_user_metadata_by_admin: {
        Args: { p_user_id_to_update: string; p_new_metadata: Json }
        Returns: undefined
      }
    }
    Enums: {
      admin_clarity_status_enum:
        | "pending_review"
        | "clear"
        | "needs_clarification_requested"
        | "clarification_provided"
      app_role: "superAdmin" | "admin" | "provider"
      clarity_status_enum: "clear" | "not_clear" | "pending"
      review_status_enum:
        | "pending"
        | "reviewed"
        | "needs_clarification"
        | "clarification_provided"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_clarity_status_enum: [
        "pending_review",
        "clear",
        "needs_clarification_requested",
        "clarification_provided",
      ],
      app_role: ["superAdmin", "admin", "provider"],
      clarity_status_enum: ["clear", "not_clear", "pending"],
      review_status_enum: [
        "pending",
        "reviewed",
        "needs_clarification",
        "clarification_provided",
      ],
    },
  },
} as const
