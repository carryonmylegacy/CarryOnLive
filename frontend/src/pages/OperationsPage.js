import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import AdminPage from './AdminPage';

/**
 * Operations Portal — stripped-down Founder Dashboard.
 * Operators see TVT, Customer Service, DTS, Tier Verifications.
 * NO financial analytics, NO dev switcher, NO user deletion.
 */
const OperationsPage = () => {
  const { user } = useAuth();

  // Render the AdminPage but it will conditionally hide founder-only sections
  // based on user.role === 'operator'
  return <AdminPage operatorMode={true} />;
};

export default OperationsPage;
