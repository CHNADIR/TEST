
import DashboardLayout from '../../components/layouts/DashboardLayout';
import ProvidersTable from '../../components/admin/ProvidersTable';

const ManageProviders = () => {
  return (
    <DashboardLayout title="Manage Providers">
      <div className="space-y-6">
        <p className="text-muted-foreground">
          Add and manage provider accounts. Providers can manage their own profiles and services.
        </p>
        
        <ProvidersTable />
      </div>
    </DashboardLayout>
  );
};

export default ManageProviders;
