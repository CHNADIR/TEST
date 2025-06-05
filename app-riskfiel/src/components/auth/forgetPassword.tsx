import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

const emailSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email' }),
});

type EmailFormValues = z.infer<typeof emailSchema>;

interface ForgotPasswordProps {
  onBackToLogin: () => void;
  defaultEmail?: string;
}

export const ForgotPassword = ({ onBackToLogin, defaultEmail = '' }: ForgotPasswordProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  
  const { 
    register, 
    handleSubmit, 
    watch,
    formState: { errors } 
  } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: defaultEmail,
    }
  });
  
  const currentEmail = watch('email');
  
  const onSubmit = async (data: EmailFormValues) => {
    setIsLoading(true);
    
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    setIsLoading(false);
    
    if (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message,
      });
    } else {
      setResetEmailSent(true);
      toast({
        variant: "default",
        title: "Email envoyé",
        description: `Instructions envoyées à ${data.email}`,
      });
    }
  };
  
  if (resetEmailSent) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-md">
          Un email contenant les instructions de réinitialisation a été envoyé à <span className="font-semibold">{currentEmail}</span>.
        </div>
        <div className="text-sm">
          Vérifiez votre boîte de réception et suivez les instructions contenues dans l'email.
        </div>
        <Button onClick={onBackToLogin} className="w-full mt-4">
          Retour à la connexion
        </Button>
      </div>
    );
  }
  
  return (
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
          disabled={isLoading}
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm font-medium text-destructive">{errors.email.message}</p>
        )}
      </div>
      
      <Button 
        type="submit" 
        className="w-full" 
        disabled={isLoading}
      >
        Envoyer les instructions
      </Button>
      
      <div className="text-center mt-4">
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Retour à la connexion
        </button>
      </div>
    </form>
  );
};