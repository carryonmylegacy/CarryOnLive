import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users } from 'lucide-react';

/**
 * Static family tree — HTML/CSS based for reliable rendering.
 * Benefactor at top → branches to beneficiaries below.
 * Also shows estates where benefactor is a beneficiary.
 */

const getAge = (dob) => {
  if (!dob) return 999;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
};

const getInitials = (name, firstName, lastName) => {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return '??';
};

const TreeNode = ({ initials, photo, color, label, sublabel, size = 56, badge, onClick, testId }) => (
  <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={onClick} data-testid={testId}>
    <div className="relative">
      <div
        className="rounded-full flex items-center justify-center font-bold transition-transform group-hover:scale-110 overflow-hidden"
        style={{
          width: size, height: size,
          background: photo ? 'transparent' : color,
          fontSize: size * 0.32,
          color: '#080e1a',
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 12px ${color}40`,
        }}
      >
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {badge && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black" style={{ background: '#d4af37', color: '#080e1a' }}>
          {badge}
        </div>
      )}
    </div>
    {label && <span className="text-[10px] font-semibold text-[var(--t)] text-center leading-tight">{label}</span>}
    {sublabel && <span className="text-[8px] text-[#64748B] text-center leading-tight">{sublabel}</span>}
  </div>
);

const FamilyTree = ({ user, beneficiaries, beneficiaryEstates, onSelectBeneficiary, className }) => {
  const navigate = useNavigate();

  const sortedBens = [...beneficiaries].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return getAge(a.date_of_birth || a.dob) - getAge(b.date_of_birth || b.dob);
  });

  const benEstates = beneficiaryEstates || [];

  return (
    <div className={className} data-testid="family-tree">
      {/* Beneficiary estates row (above root) */}
      {benEstates.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mb-3 pb-3" style={{ borderBottom: '1px dashed rgba(96,165,250,0.2)' }}>
          {benEstates.map(est => (
            <TreeNode
              key={est.id}
              initials={<Users className="w-3.5 h-3.5" />}
              color="#60A5FA"
              size={40}
              label={est.name?.split("'")[0] || 'Estate'}
              sublabel="Beneficiary"
              testId={`tree-estate-${est.id}`}
              onClick={() => {
                localStorage.setItem('beneficiary_estate_id', est.id);
                localStorage.removeItem('selected_estate_id');
                navigate('/beneficiary');
                window.location.reload();
              }}
            />
          ))}
        </div>
      )}

      {/* Root node (benefactor) */}
      <div className="flex flex-col items-center">
        <TreeNode
          initials={getInitials(user?.name, user?.first_name, user?.last_name)}
          photo={user?.photo_url}
          color="#d4af37"
          size={60}
          label={user?.first_name || user?.name?.split(' ')[0] || 'You'}
          sublabel="Benefactor"
          testId="tree-root-node"
        />

        {/* Connector: vertical trunk */}
        {sortedBens.length > 0 && (
          <div className="flex flex-col items-center">
            <div style={{ width: 2, height: 20, background: '#d4af37', opacity: 0.6 }} />

            {/* Horizontal branch + drops */}
            {sortedBens.length > 1 ? (
              <div className="relative w-full flex justify-center" style={{ minWidth: sortedBens.length * 72 }}>
                {/* Horizontal line */}
                <div className="absolute top-0 left-[10%] right-[10%]" style={{ height: 2, background: '#d4af37', opacity: 0.3 }} />
                {/* Children */}
                <div className="flex gap-3 justify-center pt-1">
                  {sortedBens.map(ben => {
                    const color = ben.is_primary ? '#d4af37' : (ben.avatar_color || '#60A5FA');
                    const age = getAge(ben.date_of_birth || ben.dob);
                    const relation = ben.relation || '';
                    return (
                      <div key={ben.id} className="flex flex-col items-center">
                        {/* Drop line */}
                        <div style={{ width: 2, height: 14, background: color, opacity: 0.5 }} />
                        <TreeNode
                          initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                          photo={ben.photo_url}
                          color={color}
                          size={48}
                          label={ben.first_name || ben.name?.split(' ')[0] || ''}
                          sublabel={`${relation}${age < 999 ? ` · ${age}` : ''}`}
                          badge={ben.is_primary ? 'P' : null}
                          testId={`tree-node-${ben.id}`}
                          onClick={() => onSelectBeneficiary?.(ben)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Single child — just vertical */
              sortedBens.map(ben => {
                const color = ben.is_primary ? '#d4af37' : (ben.avatar_color || '#60A5FA');
                const age = getAge(ben.date_of_birth || ben.dob);
                return (
                  <div key={ben.id} className="flex flex-col items-center">
                    <div style={{ width: 2, height: 14, background: color, opacity: 0.5 }} />
                    <TreeNode
                      initials={getInitials(ben.name, ben.first_name, ben.last_name)}
                      photo={ben.photo_url}
                      color={color}
                      size={48}
                      label={ben.first_name || ben.name?.split(' ')[0] || ''}
                      sublabel={`${ben.relation || ''}${age < 999 ? ` · ${age}` : ''}`}
                      badge={ben.is_primary ? 'P' : null}
                      testId={`tree-node-${ben.id}`}
                      onClick={() => onSelectBeneficiary?.(ben)}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {sortedBens.length === 0 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-[var(--t5)]">No beneficiaries added yet</p>
          </div>
        )}
      </div>

      {benEstates.length > 0 && (
        <p className="text-[9px] text-[var(--t5)] text-center mt-3">
          Blue = estates where you're a beneficiary (click to view)
        </p>
      )}
    </div>
  );
};

export default FamilyTree;
