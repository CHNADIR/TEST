
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/layouts/AuthLayout';
import { Button } from '../components/ui/button';
import { useAuthStore } from '../stores/authStore';

const Unauthorized = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  
  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };
  
  return (
    <AuthLayout 
      title="Access Denied" 
      description="You don't have permission to access this resource"
    >
      <div className="flex flex-col items-center space-y-4">
        <div className="text-center space-y-2">
          <p className="text-4xl font-bold text-destructive">401</p>
          <p className="text-sm text-muted-foreground">
            {user 
              ? `Your account (${user.email}) doesn't have the required permissions.` 
              : "You need to be logged in to access this page."}
          </p>
        </div>
        
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate('/')}>
            Home
          </Button>
          
          {user && (
            <Button onClick={handleLogout}>
              Logout
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
};

export default Unauthorized;
