import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, File } from 'lucide-react';
import axios from 'axios';
import { getCachedBlob, setCachedBlob } from '../utils/blobCache';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DocThumbnail = ({ doc }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const isPreviewable = doc.file_type && (doc.file_type.includes('pdf') || doc.file_type.includes('image'));

  useEffect(() => {
    mountedRef.current = true;
    setBlobUrl(null);
    setError(false);
    if (!isPreviewable || doc.is_locked) return;

    // Check LRU cache first
    const cached = getCachedBlob(doc.id);
    if (cached) { setBlobUrl(cached); return; }

    const token = localStorage.getItem('carryon_token');
    if (!token) { setError(true); return; }

    setLoading(true);
    axios.get(`${API_URL}/documents/${doc.id}/preview`, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'blob'
    }).then(res => {
      if (!mountedRef.current) return;
      const blob = new Blob([res.data], { type: doc.file_type });
      const url = URL.createObjectURL(blob);
      setCachedBlob(doc.id, url);
      setBlobUrl(url);
    }).catch(() => {
      if (mountedRef.current) setError(true);
    }).finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    return () => { mountedRef.current = false; };
  }, [doc.id, doc.is_locked, doc.file_type, isPreviewable]);

  if (!isPreviewable || doc.is_locked) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--s)' }}>
        {doc.is_locked ? (
          <div className="text-center">
            <File className="w-6 h-6 text-[var(--t5)] mx-auto" />
            <span className="text-[9px] text-[var(--t5)] mt-1 block">Locked</span>
          </div>
        ) : (
          <FileText className="w-8 h-8 text-[var(--t5)]" />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center animate-pulse" style={{ background: 'var(--s)' }}>
        <FileText className="w-6 h-6 text-[var(--t5)]" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--s)' }}>
        <FileText className="w-8 h-8 text-[var(--t5)]" />
      </div>
    );
  }

  const isPdf = doc.file_type?.includes('pdf');
  const isImage = doc.file_type?.includes('image');

  if (isImage) {
    return (
      <img src={blobUrl} alt={doc.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
    );
  }

  if (isPdf) {
    return (
      <div className="w-full h-full overflow-hidden flex items-start justify-center" style={{ background: '#fff' }}>
        <Document file={blobUrl} loading={<div className="w-full h-full" style={{ background: 'var(--s)' }} />} error={<FileText className="w-8 h-8 text-[var(--t5)]" />}>
          <Page pageNumber={1} width={200} renderTextLayer={false} renderAnnotationLayer={false} />
        </Document>
      </div>
    );
  }

  return null;
};

export default DocThumbnail;
