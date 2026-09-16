import React, { useState } from 'react';
import { LayoutDashboard, FolderLock, PhoneCall, ListChecks, Lock, FileText, CheckCircle2, Circle, AlertTriangle, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { RevealSection } from './RevealSection';

const card = { background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.22)' };
const pill = (color) => ({ background: `${color}1f`, border: `1px solid ${color}55`, color });

const TABS = [
  { id: 'dashboard', label: 'Your dashboard', icon: LayoutDashboard, url: 'carryon.us/dashboard' },
  { id: 'vault', label: 'Document vault', icon: FolderLock, url: 'carryon.us/vault' },
  { id: 'contacts', label: 'Who to call first', icon: PhoneCall, url: 'carryon.us/beneficiaries' },
  { id: 'checklist', label: 'What to do first', icon: ListChecks, url: 'carryon.us/checklist' },
];

const Row = ({ children, testId }) => (
  <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(11,19,34,0.6)', border: '1px solid rgba(255,255,255,0.06)' }} data-testid={testId}>{children}</div>
);

const PreviewDashboard = () => (
  <div className="grid sm:grid-cols-[180px_1fr] gap-5 items-center" data-testid="preview-panel-dashboard">
    <div className="flex flex-col items-center">
      <div className="relative w-[150px] h-[150px]">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#d4af37" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 52}`} strokeDashoffset={`${2 * Math.PI * 52 * (1 - 0.72)}`} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white text-3xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>72%</span>
          <span className="text-[#8b97ab] text-xs">Ready</span>
        </div>
      </div>
      <p className="text-[#8b97ab] text-xs mt-2 text-center">The Harris family&apos;s readiness score</p>
    </div>
    <div className="space-y-2.5">
      <p className="text-white text-sm font-semibold">Next up for you</p>
      {[
        { done: true, text: 'Upload your will', meta: 'Reviewed by Estate Guardian\u2122' },
        { done: true, text: 'Invite Sarah (spouse)', meta: 'Accepted \u00b7 can see everything' },
        { done: false, text: 'Add your life insurance policy', meta: 'Your will names a policy we can\u2019t find' },
        { done: false, text: 'Record a message for Emma\u2019s graduation', meta: 'Delivers June 2031' },
      ].map(item => (
        <Row key={item.text}>
          {item.done ? <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0" /> : <Circle className="w-4 h-4 text-[#d4af37] flex-shrink-0" />}
          <div className="min-w-0">
            <p className={`text-sm ${item.done ? 'text-[#8b97ab] line-through' : 'text-white'}`}>{item.text}</p>
            <p className="text-[#6b7a90] text-xs truncate">{item.meta}</p>
          </div>
        </Row>
      ))}
    </div>
  </div>
);

const PreviewVault = () => (
  <div className="space-y-2.5" data-testid="preview-panel-vault">
    {[
      { name: 'Last Will & Testament', folder: 'Legal', shared: 'Sarah, Michael', flag: null },
      { name: 'Revocable Living Trust', folder: 'Legal', shared: 'Sarah', flag: null },
      { name: 'Term Life Policy \u2014 Northwestern', folder: 'Insurance', shared: 'Sarah', flag: 'Beneficiary on this policy doesn\u2019t match your will' },
      { name: 'Deed \u2014 42 Maple Street', folder: 'Property', shared: 'Sarah, Michael', flag: null },
      { name: 'Durable Power of Attorney', folder: 'Legal', shared: 'Sarah', flag: null },
    ].map(doc => (
      <Row key={doc.name}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)' }}><FileText className="w-4 h-4 text-[#d4af37]" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{doc.name}</p>
          <p className="text-[#6b7a90] text-xs truncate">{doc.folder} &middot; Shared with {doc.shared}</p>
          {doc.flag && <p className="text-[#fbbf24] text-xs mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {doc.flag}</p>}
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={pill('#10b981')}><Lock className="w-3 h-3" /> Encrypted</span>
      </Row>
    ))}
  </div>
);

const PreviewContacts = () => (
  <div className="space-y-2.5" data-testid="preview-panel-contacts">
    {[
      { order: '1', name: 'Sarah Harris', role: 'Spouse \u00b7 Primary', note: 'Has full access. Call her first.' },
      { order: '2', name: 'Michael Harris', role: 'Son \u00b7 Backup', note: 'Steps in if Sarah can\u2019t.' },
      { order: '3', name: 'Dana Ruiz, Esq.', role: 'Estate attorney', note: '(703) 555-0142 \u00b7 Has the original will' },
      { order: '4', name: 'Northwestern Claims', role: 'Life insurance', note: '1-800-555-0199 \u00b7 Policy # in vault' },
    ].map(c => (
      <Row key={c.name}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}>{c.order}</div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{c.name} <span className="text-[#8b97ab] font-normal">&middot; {c.role}</span></p>
          <p className="text-[#6b7a90] text-xs truncate">{c.note}</p>
        </div>
        <Phone className="w-4 h-4 text-[#10b981] flex-shrink-0" />
      </Row>
    ))}
  </div>
);

const PreviewChecklist = () => (
  <div className="space-y-2.5" data-testid="preview-panel-checklist">
    <p className="text-[#8b97ab] text-xs uppercase tracking-wider font-semibold">The first 72 hours &mdash; what Sarah sees</p>
    {[
      { done: true, text: 'Call Michael and Dad\u2019s sister Karen', src: 'From: Who to notify' },
      { done: true, text: 'Get 10 certified copies of the death certificate', src: 'Added by Estate Guardian\u2122' },
      { done: false, text: 'Call Northwestern claims \u2014 1-800-555-0199', src: 'Pulled from the life insurance policy' },
      { done: false, text: 'Notify employer HR about survivor benefits', src: 'From: Employer letter in vault' },
      { done: false, text: 'Pause the mortgage auto-payment', src: 'From: Passwords & accounts' },
    ].map(item => (
      <Row key={item.text}>
        {item.done ? <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0" /> : <Circle className="w-4 h-4 text-[#d4af37] flex-shrink-0" />}
        <div className="min-w-0">
          <p className={`text-sm ${item.done ? 'text-[#8b97ab] line-through' : 'text-white'}`}>{item.text}</p>
          <p className="text-[#6b7a90] text-xs truncate">{item.src}</p>
        </div>
      </Row>
    ))}
  </div>
);

const PANELS = { dashboard: PreviewDashboard, vault: PreviewVault, contacts: PreviewContacts, checklist: PreviewChecklist };

export const ProductPreview = ({ testIdSuffix = '' }) => {
  const [active, setActive] = useState('dashboard');
  const tab = TABS.find(t => t.id === active);
  const Panel = PANELS[active];
  return (
    <section id="preview" className="relative z-[5]" data-testid={`product-preview${testIdSuffix}`}>
      <div className="py-20 lg:py-28 relative overflow-hidden" style={{ background: '#0E1829' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 60%)' }} />
        <div className="max-w-[1100px] mx-auto px-6 relative z-10">
          <RevealSection>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] text-center mb-3">See inside CarryOn</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
              This is what your family opens.
            </h2>
            <p className="text-[#a0aec0] text-base text-center max-w-[620px] mx-auto mb-10 leading-relaxed">
              Not a binder. Not a shoebox. One place with the documents, the people to call, and a list of what to do first &mdash; shown here with a sample family.
            </p>
          </RevealSection>
          <RevealSection delay={0.15} distance={40}>
            <div className="rounded-2xl overflow-hidden" style={{ ...card, boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(212,175,55,0.06)' }}>
              <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: 'rgba(8,14,26,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-1.5">{['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}</div>
                <div className="flex-1 flex items-center gap-2 rounded-md px-3 py-1 text-xs text-[#8b97ab]" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <Lock className="w-3 h-3 text-[#10b981]" /> {tab.url}
                </div>
              </div>
              <div className="grid md:grid-cols-[220px_1fr]">
                <div className="flex md:flex-col gap-1 p-3 overflow-x-auto" style={{ background: 'rgba(8,14,26,0.5)', borderRight: '1px solid rgba(255,255,255,0.05)' }} role="tablist">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} role="tab" aria-selected={active === id} onClick={() => setActive(id)} data-testid={`preview-tab-${id}${testIdSuffix}`}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200 text-left"
                      style={active === id ? { background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' } : { color: '#8b97ab', border: '1px solid transparent' }}>
                      <Icon className="w-4 h-4 flex-shrink-0" /> {label}
                    </button>
                  ))}
                </div>
                <div className="p-5 lg:p-7 min-h-[340px]" key={active}>
                  <div className="animate-in fade-in duration-300"><Panel /></div>
                </div>
              </div>
            </div>
          </RevealSection>
          <RevealSection delay={0.3}>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-8 text-sm text-[#8b97ab]">
              <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#10b981]" /> Real interface, sample family</span>
              <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#d4af37]" /> Flags and checklist items come from your own documents</span>
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
};

export default ProductPreview;
