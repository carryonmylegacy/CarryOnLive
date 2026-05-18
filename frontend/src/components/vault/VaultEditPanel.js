import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Loader2, Network } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import SlidePanel from '../SlidePanel';

const VaultEditPanel = ({
  open,
  onClose,
  editName,
  setEditName,
  editCategory,
  setEditCategory,
  editNotes,
  setEditNotes,
  editingDoc,
  saving,
  handleEditDocument,
}) => {
  const navigate = useNavigate();
  const linkedEntities = editingDoc?.linked_entities || [];
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Edit Document"
      subtitle="Update the document metadata"
    >
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Document Name <span className="text-red-400">*</span></Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g., Last Will & Testament"
              className="input-field"
              data-testid="edit-document-name-input"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Category <span className="text-red-400">*</span></Label>
            <Select value={editCategory} onValueChange={setEditCategory}>
              <SelectTrigger className="input-field" data-testid="edit-document-category-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--bg2)] border-[var(--b)] text-[var(--t)]">
                <SelectItem value="will">Will</SelectItem>
                <SelectItem value="trust">Trust</SelectItem>
                <SelectItem value="living_will">Living Will / Healthcare Directive</SelectItem>
                <SelectItem value="life_insurance">Life Insurance</SelectItem>
                <SelectItem value="deed">Deed / Title</SelectItem>
                <SelectItem value="poa">Power of Attorney</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="medical">Medical / Healthcare Directive</SelectItem>
                <SelectItem value="legal">Legal (Other)</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[#94a3b8]">Notes (Optional)</Label>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add any notes about this document..."
              className="input-field min-h-[80px]"
              rows={3}
              data-testid="edit-document-notes-input"
            />
          </div>
          
          {editingDoc && (
            <div className="p-3 bg-[var(--s)] rounded-xl">
              <p className="text-xs text-[#64748b]">File info</p>
              <p className="text-sm text-white">{editingDoc.file_type} · {editingDoc.file_size ? `${(editingDoc.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}</p>
            </div>
          )}

          {linkedEntities.length > 0 && (
            <div className="space-y-2" data-testid="vault-edit-linked-entities">
              <Label className="text-[#94a3b8]">Linked to entities</Label>
              <div className="flex flex-wrap gap-2">
                {linkedEntities.map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => { onClose?.(); navigate(`/financial?openEntity=${encodeURIComponent(ent.id)}`); }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors"
                    style={{
                      color: 'var(--gold)',
                      background: 'rgba(var(--gold-rgb), 0.10)',
                      border: '1px solid rgba(var(--gold-rgb), 0.35)',
                    }}
                    data-testid={`vault-entity-link-${ent.id}`}
                    title="Open this entity in your Financial Picture"
                  >
                    <Network className="w-3 h-3" />
                    {ent.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[var(--b)] text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleEditDocument}
            disabled={saving || !editName}
            className="gold-button"
            data-testid="edit-document-submit-button"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Edit2 className="w-5 h-5 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
    </SlidePanel>
  );
};

export default VaultEditPanel;
