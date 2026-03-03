import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { FolderLock, Lock, FileText, Search, ChevronLeft, Download, Eye, Loader2, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import PDFViewerModal from '../../components/PDFViewerModal';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BeneficiaryVaultPage = () => {
  const { getAuthHeaders, token } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);

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

  const handlePreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    try {
      const res = await axios.get(`${API_URL}/documents/${doc.id}/preview`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (doc) => {
    setDownloading(doc.id);
    try {
      const res = await axios.get(`${API_URL}/documents/${doc.id}/preview`, {
        ...getAuthHeaders(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name || 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  const fB = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const cats = ['all', ...new Set(documents.map(d => d.category))];
  const filtered = documents
    .filter(d => activeCategory === 'all' || d.category === activeCategory)
    .filter(d => !searchQuery || d.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6 space-y-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 bg-[var(--s)] rounded-xl" />)}
    </div>
  );

  return (
    <div className="p-4 lg:p-6 pt-20 lg:pt-6 pb-24 lg:pb-6" data-testid="beneficiary-vault">
      <button onClick={() => navigate('/beneficiary/dashboard')} className="inline-flex items-center gap-1 text-sm font-bold text-[#60A5FA] mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex items-center gap-3 mb-5">
        <FolderLock className="w-6 h-6 text-[#60A5FA]" />
        <h1 className="text-xl font-bold text-[var(--t)]" style={{ fontFamily: 'Outfit, sans-serif' }}>Secure Document Vault</h1>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
        <Search className="w-4 h-4 text-[var(--t5)]" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search documents..."
          className="flex-1 bg-transparent border-none text-[var(--t)] text-sm outline-none placeholder:text-[var(--t5)]" />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {cats.map(c => (
          <button key={c} onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${activeCategory === c ? 'bg-[#60A5FA] text-[#0F1629]' : 'bg-[var(--s)] text-[var(--t4)]'}`}>
            {c === 'all' ? 'All' : c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--t5)]">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <div key={doc.id}
              className="glass-card p-4 cursor-pointer transition-transform duration-150 active:scale-[0.98]"
              onClick={() => doc.is_locked ? null : handlePreview(doc)}
              data-testid={`ben-doc-${doc.id}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: doc.is_locked ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)' }}>
                  {doc.is_locked ? <Lock className="w-4 h-4 text-[#ef4444]" /> : <FileText className="w-4 h-4 text-[#60A5FA]" />}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--s)] text-[var(--t4)] capitalize">{doc.category?.replace(/_/g, ' ')}</span>
              </div>
              <h3 className="font-bold text-[var(--t)] text-sm mb-1 leading-tight truncate">{doc.name}</h3>
              <div className="flex justify-between items-center text-xs text-[var(--t5)] mt-2">
                <span>{fB(doc.file_size)}</span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); handlePreview(doc); }}
                    className="p-1.5 rounded-lg text-[#60A5FA] active:scale-90 transition-transform" title="View">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                    className="p-1.5 rounded-lg text-[var(--t5)] active:scale-90 transition-transform" title="Download">
                    {downloading === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <PDFViewerModal
          open={!!previewDoc}
          onClose={() => { setPreviewDoc(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}
          blobUrl={previewUrl}
          doc={previewDoc}
          loading={previewLoading}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};

export default BeneficiaryVaultPage;
