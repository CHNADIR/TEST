
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout from '../components/layouts/AuthLayout';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '@/integrations/supabase/client';

const Magic = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    const handleMagicLink = async () => {
      try {
        // Get the hash parameters from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        // If there are no tokens in the URL, we can't continue
        if (!accessToken || !refreshToken || type !== 'recovery') {
          setError('Invalid or expired magic link');
          setIsLoading(false);
          return;
        }
        
        // Set the session
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        if (sessionError) {
          setError('Failed to verify the magic link. Please try again.');
          setIsLoading(false);
          return;
        }

        // If user doesn't have password yet, send to set password
        navigate('/set-password');
      } catch (err) {
        console.error('Error processing magic link:', err);
        setError('An unexpected error occurred. Please try again.');
        setIsLoading(false);
      }
    };
    
    handleMagicLink();
  }, [navigate]);

  useEffect(() => {
    // If user is already authenticated and has password set, redirect appropriately
    if (user && user.user_metadata?.password_set === true) {
      const role = user.user_metadata?.role;
      
      if (role === 'superAdmin' || role === 'admin') {
        navigate('/dashboard');
      } else if (role === 'provider') {
        navigate('/provider/profile');
      } else {
        navigate('/unauthorized');
      }
    }
  }, [user, navigate]);

  return (
    <AuthLayout 
      title="Verifying Link" 
      description="Please wait while we verify your magic link"
    >
      <div className="flex flex-col items-center justify-center py-8">
        {isLoading ? (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-center text-muted-foreground">
              Verifying your link, please wait...
            </p>
          </div>
        ) : error ? (
          <div className="text-center space-y-4">
            <p className="text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground">
              The link may have expired. Please request a new invitation.
            </p>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
};

export default Magic;
