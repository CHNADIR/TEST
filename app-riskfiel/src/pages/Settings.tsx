import DashboardLayout from '@/components/layouts/DashboardLayout';
import SettingsComponent from '@/components/settings';

const SettingsPage = () => {
  return (
    <DashboardLayout title="settings">
      <SettingsComponent />
    </DashboardLayout>
  );
};

export default SettingsPage;