import React from 'react';
import { Shield } from 'lucide-react';
import SecuritySettings from '../components/SecuritySettings';
import { useAuth } from '../contexts/AuthContext';

const SecuritySettingsPage = () => {
  const { getAuthHeaders } = useAuth();

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="security-settings-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Security Settings
        </h1>
        <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
          Configure Triple Lock protection for each section of your estate
        </p>
      </div>

      <SecuritySettings getAuthHeaders={getAuthHeaders} />
    </div>
  );
};

export default SecuritySettingsPage;
