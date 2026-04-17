import React from 'react';
import { Lock, Unlock, Loader2, Eye, EyeOff, Key, Copy, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export const VaultSetLockModal = ({
  open,
  onOpenChange,
  selectedDoc,
  newLockPassword,
  setNewLockPassword,
  confirmLockPassword,
  setConfirmLockPassword,
  showPwEye,
  setShowPwEye,
  lockingDoc,
  handleSetLock,
}) => {
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setNewLockPassword(''); setConfirmLockPassword(''); setShowPwEye(false); } }}>
      <DialogContent className="glass-card border-[var(--b)] sm:max-w-sm !top-[10vh] !translate-y-0">
        <DialogHeader>
          <DialogTitle className="text-white text-lg flex items-center gap-2" style={{ fontFamily: 'var(--sans)' }}>
            <Lock className="w-5 h-5 text-[#ef4444]" />
            Lock Document
          </DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            Set a password for "{selectedDoc?.name}".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-[#94a3b8] text-sm">Password (min 4 characters) <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input
                type={showPwEye ? 'text' : 'password'}
                value={newLockPassword}
                onChange={(e) => setNewLockPassword(e.target.value)}
                placeholder="Enter a password"
                className="input-field pr-10"
                data-testid="set-lock-password"
              />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwEye(!showPwEye)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#94a3b8] text-sm">Confirm Password <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input
                type={showPwEye ? 'text' : 'password'}
                value={confirmLockPassword}
                onChange={(e) => setConfirmLockPassword(e.target.value)}
                placeholder="Re-enter password"
                className="input-field pr-10"
                data-testid="confirm-lock-password"
              />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwEye(!showPwEye)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                {showPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {newLockPassword && confirmLockPassword && newLockPassword !== confirmLockPassword && (
            <p className="text-xs text-[#ef4444]">Passwords do not match</p>
          )}
          <Button
            onClick={handleSetLock}
            disabled={lockingDoc || newLockPassword.length < 4 || newLockPassword !== confirmLockPassword}
            className="w-full"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white' }}
            data-testid="confirm-set-lock"
          >
            {lockingDoc ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
            Lock Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const VaultRemoveLockModal = ({
  open,
  onOpenChange,
  selectedDoc,
  lockingDoc,
  handleRemoveLock,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-[var(--b)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-lg flex items-center gap-2" style={{ fontFamily: 'var(--sans)' }}>
            <Unlock className="w-5 h-5 text-[#10b981]" />
            Remove Lock
          </DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            Remove password protection from "{selectedDoc?.name}"? Anyone with vault access will be able to view it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1 border-[var(--b)] text-[var(--t3)]" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleRemoveLock}
            disabled={lockingDoc}
            className="flex-1"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white' }}
            data-testid="confirm-remove-lock"
          >
            {lockingDoc ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
            Remove Lock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const VaultBackupCodeModal = ({
  open,
  onOpenChange,
  backupCode,
  copyBackupCode,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0">
        <DialogHeader>
          <DialogTitle className="text-white text-xl flex items-center gap-2" style={{ fontFamily: 'var(--sans)' }}>
            <Key className="w-5 h-5 text-[var(--gold)]" />
            Save Your Backup Code
          </DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            This code can be used to unlock your document if you forget the password.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="bg-[#0F1629]/50 rounded-xl p-4 text-center mb-4">
            <p className="text-2xl font-mono text-[var(--gold)] tracking-wider">{backupCode}</p>
          </div>
          
          <Button
            onClick={copyBackupCode}
            variant="outline"
            className="w-full border-[var(--b)] text-white mb-4"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy to Clipboard
          </Button>
          
          <div className="p-3 bg-[#f59e0b]/10 rounded-xl">
            <p className="text-[#f59e0b] text-sm">
              Store this code securely. It cannot be recovered if lost.
            </p>
          </div>
        </div>
        
        <Button
          onClick={() => onOpenChange(false)}
          className="gold-button w-full"
        >
          <CheckCircle2 className="w-5 h-5 mr-2" />
          I've Saved My Code
        </Button>
      </DialogContent>
    </Dialog>
  );
};
