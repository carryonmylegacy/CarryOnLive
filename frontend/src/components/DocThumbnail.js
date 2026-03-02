import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, FileImage, FileVideo, FileArchive, Loader2 } from 'lucide-react';
import axios from 'axios';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DocThumbnail = ({ doc, getAuthHeaders }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  const isPdf = doc.file_type?.toLowerCase().includes('pdf');
  const isImage = doc.file_type?.toLowerCase().includes('image');
  const isPreviewable = isPdf || isImage;

  useEffect(() => {
    mountedRef.current = true;
    setBlobUrl(null);
    setError(false);
    if (!isPreviewable || doc.is_locked) return;

    let objectUrl = null;
    setLoading(true);
    axios.get(`${API_URL}/documents/${doc.id}/preview`, {
      ...getAuthHeaders(),
      responseType: 'blob'
    }).then(res => {
      if (!mountedRef.current) return;
      const blob = new Blob([res.data], { type: doc.file_type });
      objectUrl = URL.createObjectURL(blob);
      setBlobUrl(objectUrl);
    }).catch(() => {
      if (mountedRef.current) setError(true);
    }).finally(() => {
      if (mountedRef.current) setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, doc.is_locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-previewable or locked → icon fallback
  if (!isPreviewable || doc.is_locked) {
    const Icon = doc.file_type?.includes('image') ? FileImage
      : doc.file_type?.includes('video') ? FileVideo
      : doc.file_type?.includes('zip') || doc.file_type?.includes('archive') ? FileArchive
      : FileText;
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.06)' }}>
        <Icon className="w-8 h-8 text-[#d4af37]/40" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.04)' }}>
        <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]/30" />
      </div>
    );
  }

  if (error || !blobUrl) {
    const Icon = isPdf ? FileText : FileImage;
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.06)' }}>
        <Icon className="w-8 h-8 text-[#d4af37]/40" />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-hidden" style={{ background: '#525659' }}>
        <Document file={blobUrl} loading="" onLoadError={() => setError(true)}>
          <Page pageNumber={1} width={160} renderTextLayer={false} renderAnnotationLayer={false} loading="" />
        </Document>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="w-full h-full overflow-hidden">
        <img
          src={blobUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return null;
};

export default DocThumbnail;
