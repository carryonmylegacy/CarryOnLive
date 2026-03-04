import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Upload, Loader2, X } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ShareUploadModal = ({ pendingShare, categories, uploading, onUpload, onCancel }) => {
  const { token } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [estates, setEstates] = useState([]);
  const [selectedEstate, setSelectedEstate] = useState(null);
  const [loadingEstates, setLoadingEstates] = useState(true);

  useEffect(() => {
    const fetchEstates = async () => {
      try {
        const res = await axios.get(`${API_URL}/estates`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = Array.isArray(res.data) ? res.data : [];
        setEstates(data);
        if (data.length === 1) setSelectedEstate(data[0].id);
      } catch { /* silent */ }
      finally { setLoadingEstates(false); }
    };
    if (token) fetchEstates();
  }, [token]);

  if (!pendingShare) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative rounded-2xl p-6 max-w-sm w-full" style={{ background: 'var(--bg2, #0F1629)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
        <button onClick={onCancel} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 active:scale-90">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)' }}>
            <Upload className="w-5 h-5 text-[#d4af37]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Upload to Vault</h2>
            <p className="text-xs text-white/50 truncate max-w-[200px]">{pendingShare.name}</p>
          </div>
        </div>

        {/* Estate selector (if multiple) */}
        {loadingEstates ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" /></div>
        ) : estates.length > 1 ? (
          <div className="mb-4">
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-2">Select Estate</p>
            <div className="space-y-1.5">
              {estates.map(e => (
                <button key={e.id} onClick={() => setSelectedEstate(e.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-[0.98]"
                  style={{
                    background: selectedEstate === e.id ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                    border: selectedEstate === e.id ? '1.5px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    color: selectedEstate === e.id ? '#d4af37' : '#94a3b8',
                  }}>
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Category picker */}
        <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-2">Document Category</p>
        <div className="grid grid-cols-2 gap-1.5 mb-5">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
              style={{
                background: selectedCategory === cat.id ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                border: selectedCategory === cat.id ? '1.5px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.06)',
                color: selectedCategory === cat.id ? '#d4af37' : '#94a3b8',
              }}>
              <FileText className="w-3 h-3" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Upload button */}
        <button
          onClick={() => onUpload(selectedCategory, selectedEstate)}
          disabled={!selectedCategory || !selectedEstate || uploading}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#080e1a' }}>
          {uploading ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> Upload to Secure Vault</span>
          )}
        </button>

        <p className="text-[9px] text-white/30 text-center mt-3">AES-256 encrypted · Only PDFs and images accepted</p>
      </div>
    </div>
  );
};

export default ShareUploadModal;
