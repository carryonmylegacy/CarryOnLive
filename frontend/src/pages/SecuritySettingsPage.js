import React from 'react';
import { useNavigate } from 'react-router-dom';
import SecuritySettings from '../components/SecuritySettings';
import { useAuth } from '../contexts/AuthContext';

const SecuritySettingsPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="p-4 lg:p-6 pt-4 lg:pt-6 pb-24 lg:pb-6 space-y-6 animate-fade-in max-w-4xl mx-auto" data-testid="security-settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Security Settings
          </h1>
          <p className="text-[var(--t4)] mt-1 text-sm sm:text-base">
            Configure Triple Lock protection for each estate section
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg text-sm font-bold transition-transform hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}
          data-testid="security-settings-back-button"
        >
          Back
        </button>
      </div>

      <SecuritySettings getAuthHeaders={getAuthHeaders} />
    </div>
  );
};

export default SecuritySettingsPage;
