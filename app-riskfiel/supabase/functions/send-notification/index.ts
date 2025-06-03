import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts"; // Assurez-vous que ce chemin est correct

console.log("send-notification function initializing");

serve(async (req) => {
  console.log("send-notification function invoked");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body } = await req.json();
    console.log(`Received request to notify user: ${user_id} with title: ${title}`);

    if (!user_id || !title || !body) {
      console.error("Missing user_id, title, or body");
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    console.log("Supabase admin client created for send-notification");

    // 1. Récupérer l'e-mail de l'utilisateur
    console.log(`Fetching user data for user_id: ${user_id}`);
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);

    if (userError) {
      console.error("Error fetching user:", userError.status, userError.message);
      return new Response(
        JSON.stringify({ error: userError.message || "Failed to fetch user" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: userError.status || 500,
        }
      );
    }

    if (!userData || !userData.user) {
      console.error("User not found for user_id:", user_id);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        }
      );
    }
    const userEmail = userData.user.email;
    console.log(`User email found: ${userEmail}`);

    // 2. Insérer les données dans la table notifications
    console.log(`Inserting notification for user_id: ${user_id}`);
    const { error: insertError } = await supabaseAdmin
      .from("notifications")
      .insert([{ user_id, title, body, read: false }]); // Assumant une colonne 'read'

    if (insertError) {
      console.error("Error inserting notification:", insertError.message, insertError);
      return new Response(
        JSON.stringify({ error: insertError.message || "Failed to insert notification" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500, // Erreur générique de base de données
        }
      );
    }
    console.log(`Notification inserted successfully for user_id: ${user_id}`);

    // La logique d'envoi d'e-mail est retirée d'ici.
    // Elle sera gérée par un trigger de base de données et une autre fonction.
    console.log(`Notification for user ${userEmail} (ID: ${user_id}) saved. Email processing will be handled separately.`);

    return new Response(
      JSON.stringify({ message: `Notification created for ${userEmail}. Email dispatch is being processed.` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("General error in send-notification function:", error.message, error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});