import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts' // Assurez-vous d'avoir un fichier _shared/cors.ts

// Initialisez le client Supabase une seule fois.
// Ces variables d'environnement sont automatiquement disponibles dans les Edge Functions Supabase.
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('VITE_SUPABASE_SERVICE_ROLE_KEY')!
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

async function getCallingUserRole(authHeader: string | null, anonKey: string): Promise<{ userId: string, role: string | null, error?: string, status?: number }> {
  if (!authHeader) {
    return { userId: '', role: null, error: 'Missing Authorization header', status: 401 };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabaseAnonClient = createClient(supabaseUrl, anonKey); // Utilisez la clé anon pour obtenir l'utilisateur à partir du JWT
  const { data: { user }, error: userError } = await supabaseAnonClient.auth.getUser(token);

  if (userError || !user) {
    return { userId: '', role: null, error: `Authentication failed: ${userError?.message || 'Invalid token'}`, status: 401 };
  }

  // Utilisez le client admin (service_role) pour vérifier le rôle dans user_roles
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError && roleError.code !== 'PGRST116') { // PGRST116: row not found, ce qui est ok si l'utilisateur n'a pas de rôle défini
    console.error('Error fetching user role:', roleError);
    return { userId: user.id, role: null, error: 'Failed to verify user role', status: 500 };
  }
  return { userId: user.id, role: roleData?.role || null };
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    // 1. Vérifier le rôle de l'appelant
    const { userId: callingUserId, role: callerRole, error: authError, status: authStatus } = await getCallingUserRole(authHeader, anonKey);

    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: authStatus || 500,
      });
    }

    if (callerRole !== 'superAdmin') {
      return new Response(JSON.stringify({ error: 'Permission denied: Caller is not a superAdmin.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403, // Forbidden
      });
    }

    // 2. Obtenir user_id_to_delete depuis le corps de la requête
    const body = await req.json();
    const { user_id_to_delete } = body;

    if (!user_id_to_delete || typeof user_id_to_delete !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid user_id_to_delete in request body.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400, // Bad Request
      });
    }

    // 3. Empêcher un superAdmin de se supprimer lui-même
    if (callingUserId === user_id_to_delete) {
        return new Response(JSON.stringify({ error: 'Action not allowed: superAdmin cannot delete themselves.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400, // Bad Request
        });
    }

    // 4. Exécuter la suppression (hard delete)
    // La suppression de l'utilisateur dans auth.users entraînera la suppression en cascade
    // des entrées correspondantes dans user_roles grâce à votre contrainte de clé étrangère avec ON DELETE CASCADE.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id_to_delete);

    if (deleteError) {
      console.error(`Error deleting user ${user_id_to_delete}:`, deleteError);
      // Personnaliser le message d'erreur si nécessaire
      let errorMessage = `Failed to delete user: ${deleteError.message}`;
      let errorStatus = 500;
      if (deleteError.message.toLowerCase().includes('not found')) {
        errorMessage = `User with ID ${user_id_to_delete} not found.`;
        errorStatus = 404;
      }
      return new Response(JSON.stringify({ error: errorMessage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errorStatus,
      });
    }

    return new Response(JSON.stringify({ message: `User ${user_id_to_delete} deleted successfully.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e) {
    console.error('Unhandled error in Edge Function:', e);
    return new Response(JSON.stringify({ error: e.message || 'An unexpected error occurred.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})