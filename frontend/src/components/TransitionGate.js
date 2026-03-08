import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Gates beneficiary routes behind estate transition status.
 * Pre-transition: redirects to /beneficiary (hub) or /beneficiary/pre.
 * Post-transition: renders children only if the beneficiary has permission for the section.
 */
const TransitionGate = ({ section, allowPreTransition, children }) => {
  const { token } = useAuth();
  const [status, setStatus] = useState(null); // null = loading
  const estateId = localStorage.getItem('beneficiary_estate_id');

  useEffect(() => {
    if (!estateId || !token) { setStatus({ allowed: false }); return; }

    // If this route is allowed pre-transition (e.g. POA/Living Will vault view), skip the gate
    if (allowPreTransition) {
      setStatus({ allowed: true });
      return;
    }

    axios.get(`${API_URL}/beneficiary/my-permissions/${estateId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        const { is_transitioned, sections } = res.data;
        if (!is_transitioned) {
          setStatus({ allowed: false, redirect: '/beneficiary/pre' });
        } else if (section && sections && !sections[section]) {
          setStatus({ allowed: false, redirect: '/beneficiary/dashboard' });
        } else {
          setStatus({ allowed: true });
        }
      })
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.status === 403) {
          localStorage.removeItem('beneficiary_estate_id');
        }
        setStatus({ allowed: false, redirect: '/beneficiary' });
      });
  }, [estateId, token, section, allowPreTransition]);

  if (status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="w-8 h-8 text-[var(--gold)] animate-spin" />
      </div>
    );
  }

  if (!status.allowed) {
    return <Navigate to={status.redirect || '/beneficiary'} replace />;
  }

  return children;
};

export default TransitionGate;
