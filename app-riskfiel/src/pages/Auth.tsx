import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '../components/ui/use-toast'; // Importer le hook de toast
import AuthLayout from '../components/layouts/AuthLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuthStore } from '../stores/authStore';

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Auth = () => {
  const navigate = useNavigate();
  const { login, session, loading: authLoading, initialized } = useAuthStore(); 
  const [isLoading, setIsLoading] = useState(false);

  const { 
    register, 
    handleSubmit, 
    formState: { errors } 
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    }
  });

  useEffect(() => {
    if (initialized && !authLoading && session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate, authLoading, initialized]);

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    const { error } = await login(data.email, data.password);
    setIsLoading(false);

    // Afficher un toast selon le résultat de la connexion
    if (error) {
      toast({
        variant: "destructive",
        title: "Erreur d'authentification",
        description: "Vos identifiants sont incorrects",
      });
    } else {
      toast({
        variant: "default",
        title: "Connexion réussie",
        description: `Authentifié en tant que ${data.email}`,
      });
      // Le useEffect se chargera de la redirection
    }
  };

  return (
    <AuthLayout 
      title="Login" 
      description="Enter your email and password to access your account"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="name@example.com"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={isLoading || authLoading}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm font-medium text-destructive">{errors.email.message}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            disabled={isLoading || authLoading}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-sm font-medium text-destructive">{errors.password.message}</p>
          )}
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading || authLoading}>
          {/* {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} */}
          Sign In
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Auth;
