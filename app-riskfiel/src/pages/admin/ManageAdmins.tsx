
import DashboardLayout from '../../components/layouts/DashboardLayout';
import AdminsTable from '../../components/admin/AdminsTable';

const ManageAdmins = () => {
  return (
    <DashboardLayout title="Manage Administrators">
      <div className="space-y-6">
        <p className="text-muted-foreground">
          Add and manage administrator accounts. Administrators have access to manage providers.
        </p>
        
        <AdminsTable />
      </div>
    </DashboardLayout>
  );
};

export default ManageAdmins;
