
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ProviderProfile = () => {
  const { user } = useAuthStore();
  
  return (
    <DashboardLayout title="Provider Profile">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider Profile</CardTitle>
            <CardDescription>
              View and manage your profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-sm">Account Details</h3>
                <div className="mt-2 space-y-2">
                  <div>
                    <span className="text-sm font-medium">Email: </span>
                    <span className="text-sm text-muted-foreground">{user?.email}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Role: </span>
                    <span className="text-sm text-muted-foreground capitalize">{user?.user_metadata?.role}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Welcome to the provider portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              As a provider, you can manage your profile, services, and view your schedule from this dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ProviderProfile;
