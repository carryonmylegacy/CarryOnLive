import React from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export const DeleteUserModal = ({
  deleteTarget,
  deletePassword,
  setDeletePassword,
  showDeletePw,
  setShowDeletePw,
  handleDeleteUser,
  deleting,
  onCancel,
}) => {
  if (!deleteTarget) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4 animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(15,22,41,0.98) 40%)',
          border: '1.5px solid rgba(212,175,55,0.3)',
          boxShadow: '0 0 40px rgba(212,175,55,0.08)',
        }}
        data-testid="delete-confirm-modal"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Delete Account</h3>
            <p className="text-[var(--t5)] text-[10px]">This action is irreversible</p>
          </div>
        </div>

        <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <p className="text-sm text-[var(--t3)]">
            Permanently delete <strong className="text-white">{deleteTarget.name}</strong> ({deleteTarget.role})?
          </p>
          <p className="text-[10px] text-red-400/80 mt-1">
            This will remove their account, estate, all documents, messages, beneficiaries, subscriptions, and checklists.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[var(--t4)] text-xs font-medium">Enter your admin password to confirm <span className="text-red-400">*</span></label>
          <div className="relative">
            <Input
              type={showDeletePw ? 'text' : 'password'}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && deletePassword.trim() && handleDeleteUser()}
              placeholder="Admin password"
              className="h-11 bg-[#0b1322] border-[#1a2a42] text-white placeholder:text-[#2d3d55] focus:border-[#d4af37] focus:ring-[#d4af37]/20 rounded-xl pr-10"
              autoFocus
              data-testid="delete-confirm-password"
            />
            <button type="button" onClick={() => setShowDeletePw(!showDeletePw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4a63]">
              {showDeletePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            className="flex-1 text-[var(--t4)]"
            onClick={onCancel}
            disabled={deleting}
            data-testid="delete-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            className="flex-1 font-bold"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
            onClick={handleDeleteUser}
            disabled={deleting || !deletePassword.trim()}
            data-testid="delete-confirm-btn"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete Permanently
          </Button>
        </div>
      </div>
    </div>
  );
};
