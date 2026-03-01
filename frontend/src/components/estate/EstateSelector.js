import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Home,
  Plus,
  ChevronDown,
  Check,
  Settings,
  Loader2,
  Trash2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from '../../utils/toast';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EstateSelector = ({ currentEstate, onEstateChange, estates, onEstatesUpdate }) => {
  const { getAuthHeaders } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEstateName, setNewEstateName] = useState('');

  const handleCreateEstate = async () => {
    if (!newEstateName.trim()) {
      toast.error('Please enter an estate name');
      return;
    }
    
    setCreating(true);
    try {
      const response = await axios.post(
        `${API_URL}/estates`,
        { name: newEstateName },
        getAuthHeaders()
      );
      
      // toast removed
      setShowCreateModal(false);
      setNewEstateName('');
      
      // Refresh estates list
      if (onEstatesUpdate) {
        onEstatesUpdate();
      }
      
      // Select the new estate
      if (onEstateChange) {
        onEstateChange(response.data);
      }
    } catch (error) {
      console.error('Create estate error:', error);
      toast.error('Failed to create estate');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEstate = async (estateId) => {
    if (!confirm('Are you sure you want to delete this estate? This will delete all documents, messages, and beneficiaries.')) {
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/estates/${estateId}`, getAuthHeaders());
      // toast removed
      
      if (onEstatesUpdate) {
        onEstatesUpdate();
      }
    } catch (error) {
      console.error('Delete estate error:', error);
      toast.error('Failed to delete estate');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="border-[var(--b)] bg-[var(--s)] text-[var(--t)] hover:bg-[var(--b)] gap-2"
            data-testid="estate-selector"
          >
            <Home className="w-4 h-4 text-[var(--gold)]" />
            <span className="max-w-[150px] truncate">{currentEstate?.name || 'Select Estate'}</span>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 bg-[var(--bg2)] border-[var(--b)]">
          {estates.map((estate) => (
            <DropdownMenuItem
              key={estate.id}
              onClick={() => onEstateChange && onEstateChange(estate)}
              className="text-[var(--t)] hover:bg-[var(--s)] cursor-pointer flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                {currentEstate?.id === estate.id && (
                  <Check className="w-4 h-4 text-[var(--gold)]" />
                )}
                <span className={currentEstate?.id !== estate.id ? 'ml-6' : ''}>{estate.name}</span>
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                estate.status === 'transitioned' 
                  ? 'bg-[#10b981]/20 text-[#10b981]' 
                  : 'bg-[var(--gold)]/20 text-[var(--gold)]'
              }`}>
                {estate.readiness_score}%
              </span>
            </DropdownMenuItem>
          ))}
          
          <DropdownMenuSeparator className="bg-[var(--b)]" />
          
          <DropdownMenuItem
            onClick={() => setShowCreateModal(true)}
            className="text-[var(--gold)] hover:bg-[var(--s)] cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Estate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Estate Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="glass-card border-[var(--b)] sm:max-w-md !top-[5vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle className="text-[var(--t)] text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Create New Estate
            </DialogTitle>
            <DialogDescription className="text-[var(--t4)]">
              Create a new estate to organize your legacy planning
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[var(--t4)]">Estate Name</Label>
              <Input
                value={newEstateName}
                onChange={(e) => setNewEstateName(e.target.value)}
                placeholder="e.g., Mitchell Family Trust"
                className="input-field"
                data-testid="new-estate-name-input"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setNewEstateName('');
              }}
              className="border-[var(--b)] text-[var(--t)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEstate}
              disabled={creating || !newEstateName.trim()}
              className="gold-button"
              data-testid="create-estate-submit"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 mr-2" />
                  Create Estate
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EstateSelector;
