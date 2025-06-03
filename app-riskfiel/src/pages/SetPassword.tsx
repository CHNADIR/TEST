import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

const SetPassword = () => {
  const { setPassword: authSetPassword, user } = useAuthStore(); // Renamed to avoid conflict
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
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
    // If user already has a password set, redirect to appropriate page
    if (user?.user_metadata?.password_set === true) {
      const role = user.user_metadata?.role;
      
      if (role === 'superAdmin' || role === 'admin') {
        navigate('/dashboard');
      } else if (role === 'provider') {
        navigate('/provider/profile');
      } else {
        navigate('/unauthorized');
      }
    } else if (!user) {
      // If no user is logged in, redirect to auth
      navigate('/auth');
    }
  }, [user, navigate]);
  
  const onSubmit = async (data: PasswordFormValues) => {
    setIsLoading(true);
    const { error: setError } = await authSetPassword(data.password); 
    
    if (setError) {
      toast.error(setError.message || 'Failed to set password. Please try again.');
      setIsLoading(false); 
    } else {
      toast.success('Password set successfully! Redirecting...');
      // Ne PAS appeler navigate('/') ici.
      // Le useEffect de ce composant détectera la mise à jour de user.user_metadata.password_set
      // (car authSetPassword met à jour l'utilisateur dans le store)
      // et naviguera vers la destination appropriée (ex: /provider/profile).
      // Le composant SetPassword sera démonté par la redirection initiée par le useEffect.
    }
  };
  
  // Check if invited and password not set
  const isInvited = user && user.user_metadata?.password_set === false;
  
  if (!isInvited && user) {
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
  
  return (
    <AuthLayout 
      title="Create Your Password" 
      description="Please set a password to complete your account setup"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            disabled={isLoading}
            {...register('password')}
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
          {/* {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} */}
          Set Password
        </Button>
      </form>
    </AuthLayout>
  );
};

export default SetPassword;
