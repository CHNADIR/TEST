import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/layouts/AuthLayout';
import { useAuthStore } from '../stores/authStore';
import { AuthForm } from '../components/auth/auth';
import { ForgotPassword } from '../components/auth/forgetPassword';

const Auth = () => {
  const navigate = useNavigate();
  const { session, loading: authLoading, initialized } = useAuthStore();
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);

  useEffect(() => {
    if (initialized && !authLoading && session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate, authLoading, initialized]);

  const handleForgotPasswordClick = () => {
    setIsForgotPasswordMode(true);
  };

  const handleBackToLogin = () => {
    setIsForgotPasswordMode(false);
  };

  // Contenu pour le mode "Mot de passe oublié"
  if (isForgotPasswordMode) {
    return (
      <AuthLayout 
        title="Réinitialiser votre mot de passe" 
        description="Entrez votre email pour recevoir les instructions de réinitialisation"
      >
        <ForgotPassword onBackToLogin={handleBackToLogin} />
      </AuthLayout>
    );
  }

  // Contenu normal pour la page de login
  return (
    <AuthLayout 
      title="Login" 
      description="Enter your email and password to access your account"
    >
      <AuthForm onForgotPasswordClick={handleForgotPasswordClick} />
    </AuthLayout>
  );
};

export default Auth;
