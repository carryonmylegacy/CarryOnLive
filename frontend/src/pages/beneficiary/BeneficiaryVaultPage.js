import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { FolderLock, Lock, FileText, Search, ChevronLeft, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryVaultPage = () => {
  const { getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => { fetchDocs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDocs = async () => {
    try {
      const estateId = localStorage.getItem('beneficiary_estate_id');
      if (!estateId) { navigate('/beneficiary'); return; }
      const res = await axios.get(`${API_URL}/documents/${estateId}`, getAuthHeaders());
      setDocuments(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const categories = ['all', ...new Set(documents.map(d => d.category))];
  const filtered = documents
    .filter(d => activeCategory === 'all' || d.category === activeCategory)
    .filter(d => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const fB = (b) => { if (!b) return '0 B'; const k = 1024; const s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i]; };

  if (loading) {
    return <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-4"><Skeleton className="h-10 w-64 bg-[var(--s)]" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 bg-[var(--s)] rounded-2xl" />)}</div></div>;
  }

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-5 animate-fade-in" data-testid="beneficiary-vault"
      style={{ background: 'radial-gradient(ellipse at top left, rgba(37,99,235,0.12), transparent 55%)' }}>
      {/* Back */}
      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA]">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(59,130,246,0.15))' }}>
          <FolderLock className="w-5 h-5 text-[#60A5FA]" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Secure Document Vault</h1>
          <p className="text-xs text-[var(--t5)]">{documents.length} documents · Sealed</p>
        </div>
      </div>

      {/* Sealed Banner */}
      <div className="glass-card p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-[var(--gold)] flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-[var(--gold)] text-sm">Vault Sealed — Read Only</div>
          <p className="text-xs text-[var(--t4)]">Immutably sealed. No documents can be added, modified, or removed.</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--b)' }}>
        <Search className="w-4 h-4 text-[var(--t5)]" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search documents..."
          className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
              activeCategory === c ? 'bg-[var(--bl)] text-white' : 'bg-[var(--s)] text-[var(--t4)] border border-[var(--b)]'
            }`}>
            {c === 'all' ? 'All' : c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(doc => (
          <div key={doc.id} className="glass-card p-4 cursor-pointer transition-all hover:border-[var(--b2)]" data-testid={`ben-doc-${doc.id}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <FileText className="w-4 h-4 text-[#60A5FA]" />
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--s)] text-[var(--t4)] capitalize">{doc.category?.replace(/_/g, ' ')}</span>
            </div>
            <h3 className="font-bold text-[var(--t)] text-sm mb-1 leading-tight">{doc.name}</h3>
            <div className="flex justify-between text-xs text-[var(--t5)]">
              <span>{fB(doc.file_size)}</span>
              <span>{doc.file_type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BeneficiaryVaultPage;
