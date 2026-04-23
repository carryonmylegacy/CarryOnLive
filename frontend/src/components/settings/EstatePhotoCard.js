import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { invalidateCache } from '../../utils/apiCache';
import { Shield, Pencil, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { PhotoPicker } from '../PhotoPicker';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const EstatePhotoCard = () => {
  const { user, getAuthHeaders } = useAuth();

  const [estatePhoto, setEstatePhoto] = useState(null);
  const [estateId, setEstateId] = useState(null);
  const [estateName, setEstateName] = useState('');
  const [editingEstateName, setEditingEstateName] = useState(false);
  const [estateNameDraft, setEstateNameDraft] = useState('');
  const [estateSaving, setEstateSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    axios.get(`${API_URL}/estates`, getAuthHeaders()).then(res => {
      const estates = res.data || [];
      if (estates.length > 0) {
        setEstateId(estates[0].id);
        setEstateName(estates[0].name || `${user.name || 'My'}'s Estate`);
        setEstatePhoto(estates[0].estate_photo_url || null);
      }
    }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!estateId) return null;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-[var(--t)] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--gold)]" />
          Estate Photo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--t4)]">
          Set a photo for <strong>{estateName}</strong>. This appears on your estate card and is separate from your personal profile photo.
        </p>
        <div className="flex items-center gap-4">
          <PhotoPicker
            currentPhoto={estatePhoto}
            onPhotoSelected={async (file, previewUrl) => {
              setEstatePhoto(previewUrl);
              try {
                const base64 = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result.split(',')[1]);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                const res = await axios.put(`${API_URL}/estates/${estateId}/photo`, { photo_data: base64, file_name: file.name }, getAuthHeaders());
                if (res.data?.estate_photo_url) setEstatePhoto(res.data.estate_photo_url);
                toast.success('Estate photo saved');
              } catch (err) {
                setEstatePhoto(null);
                toast.error(err?.response?.data?.detail || 'Failed to save estate photo');
              }
            }}
            onRemove={async () => {
              setEstatePhoto(null);
              try { await axios.put(`${API_URL}/estates/${estateId}/photo`, { photo_data: '', file_name: '' }, getAuthHeaders()); } catch {}
            }}
          />
          <div className="flex-1 min-w-0">
            {editingEstateName ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={estateNameDraft}
                  onChange={(e) => setEstateNameDraft(e.target.value)}
                  className="h-9 text-base"
                  style={{ fontSize: '16px' }}
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && estateNameDraft.trim()) {
                      setEstateSaving(true);
                      try {
                        const { mutateWithOutbox } = await import('../../utils/offlineMutation');
                        const r = await mutateWithOutbox({
                          entity_type: 'estate',
                          entity_id: estateId,
                          method: 'PATCH',
                          url: `/estates/${estateId}`,
                          body: { name: estateNameDraft.trim() },
                          authHeaders: getAuthHeaders(),
                        });
                        if (!r.ok) throw r.error || new Error('rename failed');
                        setEstateName(estateNameDraft.trim());
                        invalidateCache('/estates');
                        toast.success(r.queued ? 'Estate name queued — will sync when you reconnect.' : 'Estate name saved');
                      } catch { toast.error('Failed to rename estate'); }
                      setEstateSaving(false);
                      setEditingEstateName(false);
                    } else if (e.key === 'Escape') {
                      setEditingEstateName(false);
                    }
                  }}
                  data-testid="estate-name-input"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (estateNameDraft.trim()) {
                        setEstateSaving(true);
                        try {
                          const { mutateWithOutbox } = await import('../../utils/offlineMutation');
                          const r = await mutateWithOutbox({
                            entity_type: 'estate',
                            entity_id: estateId,
                            method: 'PATCH',
                            url: `/estates/${estateId}`,
                            body: { name: estateNameDraft.trim() },
                            authHeaders: getAuthHeaders(),
                          });
                          if (!r.ok) throw r.error || new Error('rename failed');
                          setEstateName(estateNameDraft.trim());
                          invalidateCache('/estates');
                          toast.success(r.queued ? 'Estate name queued — will sync when you reconnect.' : 'Estate name saved');
                        } catch { toast.error('Failed to rename estate'); }
                        setEstateSaving(false);
                      }
                      setEditingEstateName(false);
                    }}
                    disabled={estateSaving || !estateNameDraft.trim()}
                    className="h-8 px-4 rounded-md text-sm font-bold btn-gold-cta"
                    data-testid="estate-name-save"
                  >
                    {estateSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingEstateName(false)}
                    className="h-8 px-4 rounded-md text-sm text-[var(--t4)] border border-[var(--b)] hover:bg-[var(--s)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-[var(--t)] font-semibold">{estateName}</h3>
                <button
                  onClick={() => { setEstateNameDraft(estateName); setEditingEstateName(true); }}
                  className="p-1 rounded-md hover:bg-[var(--s)]"
                  data-testid="estate-name-edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--t4)]" />
                </button>
              </div>
            )}
            <p className="text-[var(--t5)] text-xs">Visible to your beneficiaries</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EstatePhotoCard;
