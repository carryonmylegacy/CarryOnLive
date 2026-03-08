import React from 'react';
import AdminPage from './AdminPage';

/**
 * Operations Portal — stripped-down Founder Dashboard.
 * Operators see TVT, Customer Service, DTS, Tier Verifications.
 * NO financial analytics, NO dev switcher, NO user deletion.
 */
const OperationsPage = () => {
  return <AdminPage operatorMode={true} />;
};

export default OperationsPage;
