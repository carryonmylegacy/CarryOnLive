import React from 'react';
import {
  Shield, Unlock, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const VaultUnlockModal = ({
  open,
  onOpenChange,
  selectedDoc,
  unlockPassword,
  setUnlockPassword,
  unlockBackupCode,
  setUnlockBackupCode,
  showUnlockPwEye,
  setShowUnlockPwEye,
  handleUnlock,
  unlocking,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl" style={{ fontFamily: 'var(--sans)' }}>
            Unlock Document
          </DialogTitle>
          <DialogDescription className="text-[#94a3b8]">
            {selectedDoc?.lock_type === 'password' && 'Enter the password to access this document'}
            {selectedDoc?.lock_type !== 'password' && 'Enter your backup code'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="text-center">
            <Shield className="w-12 h-12 mx-auto text-[var(--gold)] mb-2" />
            <p className="text-white font-medium">{selectedDoc?.name}</p>
            <p className="text-[#64748b] text-sm">
              Protected with {selectedDoc?.lock_type === 'password' ? 'password' : 'backup code'} security
            </p>
          </div>
          
          {selectedDoc?.lock_type === 'password' && (
            <div className="space-y-2">
              <Label className="text-[#94a3b8]">Password <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showUnlockPwEye ? 'text' : 'password'}
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="Enter document password"
                  className="input-field pr-10"
                  data-testid="unlock-password-input"
                />
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowUnlockPwEye(!showUnlockPwEye)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t5)]">
                  {showUnlockPwEye ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">
              {selectedDoc?.lock_type === 'password' ? 'Or use Backup Code' : 'Backup Code'}
            </Label>
            <Input
              type="text"
              value={unlockBackupCode}
              onChange={(e) => setUnlockBackupCode(e.target.value)}
              placeholder="e.g., 1234-5678-9012"
              className="input-field"
              data-testid="unlock-backup-input"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[var(--b)] text-white"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleUnlock}
            disabled={unlocking || (!unlockPassword && !unlockBackupCode)}
            className="gold-button"
            data-testid="unlock-submit-button"
          >
            {unlocking ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Unlocking...
              </>
            ) : (
              <>
                <Unlock className="w-5 h-5 mr-2" />
                Unlock & Download
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VaultUnlockModal;
