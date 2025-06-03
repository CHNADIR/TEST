import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

console.log("invite-user function initializing (v2 - metadata as source of truth)");

serve(async (req: Request) => {
  console.log("invite-user function invoked");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, role } = await req.json();
    console.log(`Received request to invite: ${email} with role: ${role}`);

    if (!email || !role) {
      console.error("Missing email or role");
      return new Response(
        JSON.stringify({ error: "Email and role are required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const validRoles = ["admin", "provider", "superAdmin"];
    if (!validRoles.includes(role)) {
      console.error(`Invalid role: ${role}. Valid roles are: ${validRoles.join(", ")}`);
      return new Response(
        JSON.stringify({ error: `Invalid role specified. Valid roles are: ${validRoles.join(", ")}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const supabaseAdmin: SupabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    console.log("Supabase admin client created");

    console.log(`Attempting to invite user: ${email} with role: ${role}`);
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { // Ces données seront stockées dans user_metadata
          role: role,
          password_set: false, // L'utilisateur devra définir son mot de passe
        },
        // redirectTo: "YOUR_APP_URL/set-password" // Optionnel: URL de redirection après acceptation de l'invitation
                                                // Le lien d'invitation mènera d'abord à une page Supabase
                                                // pour accepter et définir le mot de passe.
      }
    );

    if (inviteError) {
      console.error("Error inviting user:", inviteError.status, inviteError.message, inviteError);
      let errorMessage = inviteError.message || "Failed to invite user";
      if (inviteError.message && inviteError.message.includes("already registered")) {
         errorMessage = "This email address is already registered and an active user. If they need to set a password, they can use the 'Forgot Password' link.";
      } else if (inviteError.message && inviteError.message.includes("User already invited")) {
        errorMessage = "This email address has already been invited. They should check their email for the invitation or you can resend it from the Supabase dashboard.";
      }
      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: inviteError.status || 500,
        }
      );
    }

    console.log(`User invited successfully: ${inviteData.user?.email}. Invitation email will be sent by Supabase Auth.`);
    // Le trigger `trigger_sync_metadata_to_user_roles_after_insert_update` sur `auth.users`
    // va maintenant s'assurer que `public.user_roles` est synchronisé avec le rôle défini dans user_metadata.

    return new Response(
      JSON.stringify({ message: `Invitation email sent to ${email}. They will receive an email to set their password.` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("General error in invite-user function:", error.message, error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
