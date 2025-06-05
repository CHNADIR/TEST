import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js'; // Importer User et Session

// Définir un type plus précis pour le rôle applicatif
export type AppRole = 'superAdmin' | 'admin' | 'provider';

interface AuthState {
  user: User | null; // Utiliser le type User de Supabase
  session: Session | null; // Utiliser le type Session de Supabase
  userId: string | null; // ID de l'utilisateur connecté
  userAppRole: AppRole | null; // Rôle applicatif de l'utilisateur
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<{ error: any | null }>;
  logout: () => Promise<void>;
  setPassword: (password: string) => Promise<{ error: any | null }>;
  refreshSession: () => Promise<void>;
  inviteUser: (email: string, role: 'admin' | 'provider') => Promise<{ error: any | null }>;
}

// Fonction utilitaire pour extraire les informations de l'utilisateur
const extractUserInfo = (user: User | null) => {
  if (!user) {
    return { userId: null, userAppRole: null };
  }
  return {
    userId: user.id,
    userAppRole: user.user_metadata?.role as AppRole | null || null,
  };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  userId: null,
  userAppRole: null,
  loading: true,
  initialized: false,
  
  login: async (email, password) => {
    try {
      cleanupAuthState();
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {/* Continue */}
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast.error('Login failed: ' + error.message);
        return { error };
      }
      
      const userInfo = extractUserInfo(data.user);
      set({ 
        user: data.user,
        session: data.session,
        userId: userInfo.userId,
      });
      
      // Récupérer le rôle depuis user_roles - point clé de la correction
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.session.user.id)
        .single();
      
      if (!roleError && roleData) {
        set({ userAppRole: roleData.role });
      } else {
        // Fallback aux métadonnées si pas de rôle dans la table
        set({ userAppRole: userInfo.userAppRole });
      }

      return { error: null };
    } catch (err: any) {
      toast.error('Login failed: ' + err.message);
      return { error: err };
    }
  },
  
  logout: async () => {
    try {
      cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' });
      set({ user: null, session: null, userId: null, userAppRole: null });
      toast.success('Logged out successfully');
      window.location.href = '/auth';
    } catch (error: any) {
      toast.error('Logout failed: ' + error.message);
    }
  },
  
  setPassword: async (password) => {
    // Validation côté client
    if (password.length < 12) {
      return { error: { message: 'Le mot de passe doit contenir au moins 12 caractères' } };
    }
    
    if (!/[A-Z]/.test(password)) {
      return { error: { message: 'Le mot de passe doit contenir au moins une lettre majuscule' } };
    }
    
    if (!/[a-z]/.test(password)) {
      return { error: { message: 'Le mot de passe doit contenir au moins une lettre minuscule' } };
    }
    
    if (!/[0-9]/.test(password)) {
      return { error: { message: 'Le mot de passe doit contenir au moins un chiffre' } };
    }
    
    if (!/[^A-Za-z0-9]/.test(password)) {
      return { error: { message: 'Le mot de passe doit contenir au moins un caractère spécial' } };
    }
    
    // Si la validation passe, poursuivre avec la mise à jour du mot de passe
    try {
      const currentUser = get().user;
      const existingMetadata = currentUser?.user_metadata || {};

      const { data, error } = await supabase.auth.updateUser({
        password,
        data: { 
          ...existingMetadata, 
          password_set: true
        }
      });
      
      if (error) {
        toast.error('Password update failed: ' + error.message);
        return { error };
      }
      
      const userInfo = extractUserInfo(data.user);
      set({ 
        user: data.user, // data.user contient l'utilisateur mis à jour
        userId: userInfo.userId,
        userAppRole: userInfo.userAppRole,
        // La session n'est pas directement mise à jour par updateUser, 
        // onAuthStateChange devrait gérer la mise à jour de la session si nécessaire
      }); 
      toast.success('Password set successfully');
      return { error: null };
    } catch (err: any) {
      toast.error('Password update failed: ' + err.message);
      return { error: err };
    }
  },
  
  refreshSession: async () => {
    set({ loading: true });
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;

      if (sessionData?.session) {
        // Note: getUser() n'est pas toujours nécessaire si session.user est à jour.
        // Cependant, pour être sûr d'avoir les dernières user_metadata, un appel à getUser peut être utile.
        // Pour simplifier, on se fie à session.user qui est mis à jour par onAuthStateChange.
        const user = sessionData.session.user;
        const userInfo = extractUserInfo(user);
        set({ 
          user: user,
          session: sessionData.session,
          userId: userInfo.userId,
          userAppRole: userInfo.userAppRole,
        });
      } else {
        set({ user: null, session: null, userId: null, userAppRole: null });
      }
    } catch (error) {
      console.error('Session refresh failed:', error);
      set({ user: null, session: null, userId: null, userAppRole: null }); // Assurer un état propre en cas d'erreur
    } finally {
      set({ loading: false, initialized: true });
    }
  },
  
  inviteUser: async (email, role) => {
    try {
      const { data, error: functionInvokeError } = await supabase.functions.invoke('invite-user', {
        body: { email, role },
      });

      if (functionInvokeError) {
        console.error('Error invoking invite-user Edge Function:', functionInvokeError);
        toast.error(`Invitation failed: ${functionInvokeError.message}`);
        return { error: functionInvokeError }; 
      }

      if (data && data.error) {
        console.error('Error response from invite-user Edge Function:', data.error);
        const errorMessage = typeof data.error === 'string' ? data.error : (data.error.message || 'An error occurred in the invitation process.');
        toast.error(`Invitation failed: ${errorMessage}`);
        return { error: data }; 
      }
      
      toast.success(data?.message || `Invitation process initiated for ${email}.`);
      return { error: null };

    } catch (err: any) {
      console.error('Unexpected client-side error during inviteUser:', err);
      toast.error('Invitation failed: ' + (err.message || 'An unexpected client-side error occurred.'));
      return { error: err };
    }
  }
}));

// Helper function to clean up auth state to prevent authentication limbo
const cleanupAuthState = () => {
  // Remove standard auth tokens
  localStorage.removeItem('supabase.auth.token'); // Ceci est l'ancien format de clé, peut être obsolète
  
  // Les clés de session Supabase v2 sont plus complexes et stockées sous une clé unique.
  // supabase.auth.signOut() est la meilleure façon de nettoyer.
  // Cependant, pour un nettoyage manuel forcé en cas de problème :
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('sb-') && key.includes('-auth-token')) { // Supabase v2 auth token key pattern
      localStorage.removeItem(key);
    }
    // Vous pourriez aussi vouloir nettoyer d'autres clés liées à Supabase si nécessaire
    // if (key.startsWith('supabase.')) { // Ancien pattern
    //   localStorage.removeItem(key);
    // }
  });
  
  // Remove from sessionStorage if in use (généralement pas utilisé par Supabase JS v2 pour les tokens)
  Object.keys(sessionStorage || {}).forEach((key) => {
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      sessionStorage.removeItem(key);
    }
  });
  console.log('Auth state cleaned up from localStorage/sessionStorage');
};

// Setup auth state listener with improved handling of USER_UPDATED events
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth state change:', event, session);

  const currentUser = session?.user || null;
  const userInfo = extractUserInfo(currentUser);
  
  useAuthStore.setState({ 
    session, 
    user: currentUser, 
    userId: userInfo.userId,
    userAppRole: userInfo.userAppRole,
    loading: false, 
    initialized: true 
  });

  if (event === 'SIGNED_IN') {
    // L'utilisateur est connecté, la session et l'utilisateur sont mis à jour.
    // Vous pouvez ajouter ici une logique spécifique à la connexion si nécessaire.
  } else if (event === 'SIGNED_OUT') {
    // L'utilisateur est déconnecté.
    // cleanupAuthState(); // Appeler signOut() est préférable, mais cela peut être un filet de sécurité.
    // set({ user: null, session: null, loading: false }); // Déjà géré par la mise à jour générale ci-dessus
  } else if (event === 'USER_UPDATED') {
    // Les informations de l'utilisateur dans la session ont été mises à jour.
    // La mise à jour de `user` et `session` ci-dessus devrait suffire.
  } else if (event === 'TOKEN_REFRESHED') {
    // Le token a été rafraîchi, la session est mise à jour.
    // La mise à jour de `user` et `session` ci-dessus devrait suffire.
  } else if (event === 'PASSWORD_RECOVERY') {
    // L'utilisateur est dans un flux de récupération de mot de passe.
    // Vous pourriez vouloir rediriger vers une page de réinitialisation de mot de passe.
  } else if (event === 'INITIAL_SESSION') {
    // La session initiale a été chargée (ou il n'y en a pas).
    // `loading: false` et `initialized: true` sont importants ici.
  }
});

// Dans votre authStore.ts/tsx, ajoutez la récupération du rôle depuis user_roles
const fetchUserRole = async (userId: string) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
  
  return data?.role;
};

// Initialize session
// L'appel à refreshSession() ici peut être redondant si onAuthStateChange gère INITIAL_SESSION.
// Cependant, il peut forcer une vérification avec le serveur.
// Si vous rencontrez des problèmes, essayez de commenter la ligne suivante pour voir si INITIAL_SESSION suffit.
// useAuthStore.getState().refreshSession(); 
// Il est souvent préférable de laisser onAuthStateChange gérer l'état initial.
// Si vous le gardez, assurez-vous que `loading` est bien géré.

// Pour s'assurer que l'état initial est chargé par onAuthStateChange:
// Il n'est pas nécessaire d'appeler refreshSession() explicitement ici si onAuthStateChange
// est configuré avant le rendu de l'application, car il recevra l'événement INITIAL_SESSION.
// Si vous voulez explicitement charger la session au démarrage de l'app,
// assurez-vous que `loading` est géré correctement dans `refreshSession`.
// Par exemple, `refreshSession` devrait mettre `loading: false` dans son `finally` block.
// La version actuelle de refreshSession le fait déjà.

// Appel initial pour récupérer la session si elle existe déjà (par exemple, au rechargement de la page)
// Cela déclenchera onAuthStateChange avec INITIAL_SESSION
(async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Error getting initial session:", error);
    useAuthStore.setState({ loading: false, initialized: true, user: null, session: null, userId: null, userAppRole: null });
  } else if (session) {
    // Récupérer le rôle depuis user_roles
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();
    
    const userInfo = extractUserInfo(session.user);
    
    useAuthStore.setState({ 
      session, 
      user: session.user, 
      userId: userInfo.userId,
      userAppRole: roleData?.role || userInfo.userAppRole,
      loading: false, 
      initialized: true 
    });
  } else {
    useAuthStore.setState({ loading: false, initialized: true, user: null, session: null, userId: null, userAppRole: null });
  }
})();
