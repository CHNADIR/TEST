import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AuthLayout from '../components/layouts/AuthLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '@/integrations/supabase/client';

const passwordSchema = z.object({
  password: z.string()
    .min(12, 'Le mot de passe doit contenir au moins 12 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

const SetPassword = () => {
  const { setPassword: authSetPassword, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  
  const { 
    register, 
    handleSubmit, 
    formState: { errors } 
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    }
  });
  
  useEffect(() => {
    // Détecter si nous sommes en mode réinitialisation de mot de passe
    // en vérifiant si l'URL contient un hash de récupération
    const hash = window.location.hash;
    const isRecoveryFlow = hash && hash.includes('type=recovery');
    setIsResetMode(isRecoveryFlow);
    
    // Si c'est un flux de récupération, pas besoin de vérifier user.password_set
    if (isRecoveryFlow) {
      return;
    }
    
    // Logique pour le mode "set password" (après invitation)
    if (user?.user_metadata?.password_set === true) {
      const role = user.user_metadata?.role;
      
      if (role === 'superAdmin' || role === 'admin') {
        navigate('/dashboard');
      } else if (role === 'provider') {
        navigate('/provider/profile');
      } else {
        navigate('/unauthorized');
      }
    } else if (!user && !isRecoveryFlow) {
      // Si pas d'utilisateur et pas en mode récupération, rediriger vers auth
      navigate('/auth');
    }
  }, [user, navigate]);
  
  const onSubmit = async (data: PasswordFormValues) => {
    setIsLoading(true);
    
    if (isResetMode) {
      // Mode réinitialisation de mot de passe
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });
      
      if (error) {
        toast.error(error.message || 'Failed to reset password. Please try again.');
      } else {
        toast.success('Password reset successfully! You can now login with your new password.');
        setTimeout(() => {
          navigate('/auth', { replace: true });
        }, 2000);
      }
    } else {
      // Mode définition initiale du mot de passe
      const { error: setError } = await authSetPassword(data.password);
      
      if (setError) {
        toast.error(setError.message || 'Failed to set password. Please try again.');
      } else {
        toast.success('Password set successfully! Redirecting...');
        // Le useEffect de ce composant s'occupera de la redirection
      }
    }
    
    setIsLoading(false);
  };
  
  // Vérifier si l'utilisateur est invité et n'a pas encore défini de mot de passe
  const isInvited = user && user.user_metadata?.password_set === false;
  
  // Si on n'est pas en mode reset et que l'utilisateur n'est pas en cours d'invitation
  if (!isResetMode && !isInvited && user) {
    return (
      <AuthLayout 
        title="Not Authorized" 
        description="You don't need to set a password at this time."
      >
        <div className="flex justify-center">
          <Button onClick={() => navigate('/')}>Go to Home</Button>
        </div>
      </AuthLayout>
    );
  }
  
  // Ajouter un indicateur visuel de la force du mot de passe
  const PasswordStrengthIndicator = ({ password }: { password: string }) => {
    const getStrengthPercent = () => {
      if (!password) return 0;
      
      let strength = 0;
      if (password.length >= 12) strength += 25;
      if (/[A-Z]/.test(password)) strength += 25;
      if (/[a-z]/.test(password)) strength += 25;
      if (/[0-9]/.test(password)) strength += 12.5;
      if (/[^A-Za-z0-9]/.test(password)) strength += 12.5;
      
      return strength;
    };

    const strengthPercent = getStrengthPercent();
    const getColor = () => {
      if (strengthPercent < 50) return "bg-red-500";
      if (strengthPercent < 75) return "bg-yellow-500";
      return "bg-green-500";
    };

    return (
      <div className="mt-2">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className={`h-2.5 rounded-full ${getColor()}`} 
            style={{ width: `${strengthPercent}%` }}
          ></div>
        </div>
        <p className="text-xs mt-1 text-gray-500">
          Force du mot de passe: {strengthPercent < 50 ? "Faible" : strengthPercent < 75 ? "Moyenne" : "Forte"}
        </p>
      </div>
    );
  };

  return (
    <AuthLayout 
      title={isResetMode ? "Reset Your Password" : "Create Your Password"} 
      description={isResetMode 
        ? "Please enter a new password to reset your account" 
        : "Please set a password to complete your account setup"
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            disabled={isLoading}
            {...register('password')}
            onChange={(e) => setPasswordValue(e.target.value)}
          />
          {errors.password && (
            <p className="text-sm font-medium text-destructive">{errors.password.message}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <Input
            id="confirm-password"
            type="password"
            disabled={isLoading}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-sm font-medium text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isResetMode ? "Reset Password" : "Set Password"}
        </Button>
        
        {passwordValue && <PasswordStrengthIndicator password={passwordValue} />}
      </form>
    </AuthLayout>
  );
};

export default SetPassword;
