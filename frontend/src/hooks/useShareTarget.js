import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isNative } from '../services/native';
import axios from 'axios';
import { toast } from '../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Accepted file types — PDFs and images only (no editable formats)
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/tiff',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const CATEGORY_OPTIONS = [
  { id: 'will', label: 'Will' },
  { id: 'trust', label: 'Trust' },
  { id: 'living_will', label: 'Living Will' },
  { id: 'life_insurance', label: 'Life Insurance' },
  { id: 'deed', label: 'Deed / Title' },
  { id: 'poa', label: 'Power of Attorney' },
  { id: 'financial', label: 'Financial' },
  { id: 'medical', label: 'Medical' },
  { id: 'legal', label: 'Legal (Other)' },
  { id: 'personal', label: 'Personal' },
];

export const useShareTarget = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [pendingShare, setPendingShare] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isNative) return;

    let listener;
    const setup = async () => {
      try {
        const { ShareTarget } = await import('@capgo/capacitor-share-target');
        listener = await ShareTarget.addListener('shareReceived', (event) => {
          if (event.files && event.files.length > 0) {
            const file = event.files[0]; // Take first file
            
            // Validate type
            if (!ACCEPTED_TYPES.includes(file.type)) {
              toast.error('Only PDFs and images are accepted. Word documents and other editable formats are not supported.');
              return;
            }

            setPendingShare({
              uri: file.uri,
              name: file.name || 'Shared Document',
              type: file.type,
            });
            setShowCategoryPicker(true);
          }
        });
      } catch {
        // Plugin not available — silent
      }
    };
    setup();

    return () => { if (listener) listener.remove(); };
  }, []);

  const uploadSharedFile = async (category, estateId) => {
    if (!pendingShare || !token) return;
    setUploading(true);

    try {
      // Read file from share URI
      const { Filesystem } = await import('@capacitor/filesystem');
      const fileData = await Filesystem.readFile({ path: pendingShare.uri });
      
      // Convert base64 to blob
      const byteString = atob(fileData.data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: pendingShare.type });

      if (blob.size > MAX_FILE_SIZE) {
        toast.error('File too large. Maximum size is 25MB.');
        return;
      }

      // Upload via FormData
      const formData = new FormData();
      formData.append('file', blob, pendingShare.name);
      formData.append('category', category);
      formData.append('estate_id', estateId);

      await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
      });

      setPendingShare(null);
      setShowCategoryPicker(false);
      navigate('/vault');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const cancelShare = () => {
    setPendingShare(null);
    setShowCategoryPicker(false);
  };

  return {
    pendingShare,
    showCategoryPicker,
    uploading,
    uploadSharedFile,
    cancelShare,
    CATEGORY_OPTIONS,
  };
};
