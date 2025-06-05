import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-9xl font-bold text-gray-900 dark:text-gray-100">404</h1>
      <h2 className="mt-8 text-3xl font-semibold text-gray-700 dark:text-gray-300">
        {t('errors.notFound.title')}
      </h2>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
        {t('errors.notFound.message')}
      </p>
      <Button 
        className="mt-8" 
        onClick={() => navigate('/')}
      >
        {t('errors.notFound.returnHome')}
      </Button>
    </div>
  );
};

export default NotFound;
