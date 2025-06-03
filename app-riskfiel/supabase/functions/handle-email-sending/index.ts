import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts"; // Assurez-vous que ce chemin est correct

console.log("handle-email-sending function initializing (v_fetch_resend)");

// Pas besoin d'importer le SDK Resend si on utilise fetch directement

serve(async (req) => {
  console.log("handle-email-sending function invoked");

  if (req.method === "OPTIONS") {
    console.log("OPTIONS request received, responding with CORS headers.");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Le payload du Database Webhook est directement l'objet 'record' (ou 'old_record', 'type')
    // Si vous avez configuré le webhook pour envoyer le payload complet, il sera sous la forme:
    // { type: "INSERT", table: "notifications", record: { id: "...", ... }, schema: "public", old_record: null }
    // Ajustez la déstructuration si nécessaire en fonction de ce que vous voyez dans les logs du webhook.
    // Pour l'instant, on suppose que le corps de la requête est directement l'objet envoyé par le webhook.
    const webhookPayload = await req.json();
    console.log("Received webhook payload:", JSON.stringify(webhookPayload, null, 2));

    // Extraire l'enregistrement de la notification. Le webhook envoie un objet avec 'record'.
    const notification = webhookPayload.record;

    if (!notification || !notification.id || !notification.user_id || !notification.title || !notification.body) {
      console.error("Invalid notification record received from webhook:", notification);
      return new Response(JSON.stringify({ error: "Invalid notification record" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    console.log(`Processing notification ID: ${notification.id} for user_id: ${notification.user_id}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${Deno.env.get("VITE_VITE_SUPABASE_SERVICE_ROLE_KEY")}` } } }
    );
    console.log("Supabase admin client created for handle-email-sending.");

    // Récupérer l'e-mail de l'utilisateur
    console.log(`Fetching user data for user_id: ${notification.user_id}`);
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(notification.user_id);

    if (userError) {
      console.error(`Error fetching user ${notification.user_id}:`, userError.status, userError.message);
      return new Response(JSON.stringify({ error: userError.message || "Failed to fetch user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: userError.status || 500,
      });
    }
    
    if (!userData || !userData.user) {
      console.error("User not found for user_id:", notification.user_id);
      return new Response(JSON.stringify({ error: "User not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }
    const userEmail = userData.user.email;

    if (!userEmail) {
        console.error("User email is null or undefined for user_id:", notification.user_id);
        return new Response(JSON.stringify({ error: "User email not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404, // Ou 500 si c'est une erreur inattendue
        });
    }
    console.log(`User email found: ${userEmail} for user_id: ${notification.user_id}`);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_SENDER = Deno.env.get("EMAIL_SENDER");

    if (!RESEND_API_KEY) {
        console.error("RESEND_API_KEY environment variable is not set.");
        return new Response(JSON.stringify({ error: "Email service API key not configured" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
    if (!EMAIL_SENDER) {
        console.error("EMAIL_SENDER environment variable is not set.");
        return new Response(JSON.stringify({ error: "Email sender address not configured" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
    console.log(`Attempting to send email from: ${EMAIL_SENDER} to: ${userEmail} for notification ID: ${notification.id}`);

    const emailPayload = {
      from: EMAIL_SENDER, // Doit être une adresse de votre domaine vérifié sur Resend
      to: [userEmail],
      subject: notification.title,
      html: `<p>${notification.body}</p><p><small>Notification ID: ${notification.id}</small></p>`,
      // Vous pouvez ajouter une version texte pour les clients email qui ne supportent pas HTML
      // text: `${notification.body}\n\nNotification ID: ${notification.id}`,
    };

    console.log("Sending email with payload:", JSON.stringify(emailPayload, null, 2));

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseBodyText = await resendResponse.text(); // Lire le corps une seule fois

    if (!resendResponse.ok) {
      console.error(`Failed to send email via Resend for notification ${notification.id} to ${userEmail}. Status: ${resendResponse.status}. Body: ${responseBodyText}`);
      return new Response(JSON.stringify({ error: "Failed to send email", details: responseBodyText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: resendResponse.status, // Renvoyer le statut d'erreur de Resend
      });
    }

    let responseData;
    try {
        responseData = JSON.parse(responseBodyText); // Essayer de parser comme JSON si OK
    } catch (e) {
        console.warn("Resend response was not JSON, but status was OK. Body:", responseBodyText);
        responseData = { id: "N/A - Non-JSON response" }; // Fallback
    }
    
    console.log(`Email sent successfully to ${userEmail} via Resend. Response Email ID: ${responseData?.id || 'N/A'}`);

    return new Response(JSON.stringify({ message: `Email successfully queued for ${userEmail}. Resend ID: ${responseData?.id || 'N/A'}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("General error in handle-email-sending function:", error.message, error.stack);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});