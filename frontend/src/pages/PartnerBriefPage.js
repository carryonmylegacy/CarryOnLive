import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import apiClient from '../utils/apiClient';
import { API_URL } from '../config';

/**
 * PartnerBriefPage — public, no-auth, shareable B2B screening brief.
 *
 * Content is fetched from `GET /api/partner-brief` so the founder can
 * edit every character of the verbiage from Admin → Marketing → Sales
 * Brief without a redeploy. The endpoint falls back to the founder-
 * approved DEFAULTS shipped in the backend route, so an unconfigured
 * environment still shows the correct copy.
 *
 * Critical pathway — do not delete the route or component without
 * explicit founder confirmation. See AGENT_RULES.md → Rule -3.
 */
export default function PartnerBriefPage() {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const fullUrl = useMemo(
    () => (typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : ''),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`${API_URL}/partner-brief`)
      .then((r) => { if (!cancelled) setContent(r.data?.content || null); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load brief'); });
    return () => { cancelled = true; };
  }, []);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };
  const onPrint = () => window.print();

  if (error) {
    return (
      <div style={shellStyle} data-testid="partner-brief-page">
        <div style={{ padding: '40px 24px', textAlign: 'center', color: '#94A3B8' }}>
          Could not load the partner brief right now. Please try again in a moment.
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div style={shellStyle} data-testid="partner-brief-page">
        <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
      </div>
    );
  }

  const c = content;

  return (
    <div style={shellStyle} data-testid="partner-brief-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-light { background: #fff !important; color: #111 !important; }
          .print-light * { color: #111 !important; border-color: #ddd !important; background: transparent !important; }
        }
        .pb-anchor { scroll-margin-top: 80px; }
      `}</style>

      {/* Top bar */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(15,22,41,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(212,175,55,0.18)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: '#d4af37' }}>CarryOn<span style={{ fontSize: 12, verticalAlign: 'top' }}>™</span></span>
            <span style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8' }}>Partner Brief</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCopy} data-testid="partner-brief-copy-link"
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#080e1a', border: 'none', cursor: 'pointer' }}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <button onClick={onPrint} data-testid="partner-brief-print"
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'transparent', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer' }}>
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="print-light" style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header */}
        <header style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37', marginBottom: 8 }}>
            {c.header?.eyebrow}
          </p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, lineHeight: 1.1, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>
            {c.header?.title}
          </h1>
          <p style={{ fontSize: 16, color: '#94A3B8', marginTop: 12, lineHeight: 1.6 }}>
            {c.header?.intro}
          </p>
        </header>

        {/* TOC */}
        <nav style={tocStyle}>
          <p style={tocLabelStyle}>Contents</p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 14 }}>
            <li><a href="#one-breath" style={linkStyle}>{c.one_breath?.title}</a></li>
            <li><a href="#pillars" style={linkStyle}>{c.pillars?.title}</a></li>
            <li><a href="#verticals" style={linkStyle}>{c.verticals?.title}</a></li>
            <li><a href="#adjacent" style={linkStyle}>{c.adjacent?.title}</a></li>
            <li><a href="#screening" style={linkStyle}>{c.screening?.title}</a></li>
            <li><a href="#elevator" style={linkStyle}>{c.elevator?.title}</a></li>
          </ol>
        </nav>

        {/* 1. One breath */}
        <Section id="one-breath" title={c.one_breath?.title}>
          <Quote>{c.one_breath?.quote}</Quote>
          <p style={pStyle}>{c.one_breath?.paragraph}</p>
        </Section>

        {/* 2. Pillars */}
        <Section id="pillars" title={c.pillars?.title}>
          <p style={pStyle}>{c.pillars?.intro}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(c.pillars?.items || []).map((p, i) => (
              <div key={p.abbr || i} style={pillarCardStyle}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#d4af37', fontWeight: 600 }}>{p.n}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>{p.name}</h3>
                  <span style={{ fontSize: 11, color: '#64748B', letterSpacing: '0.1em' }}>{p.abbr}</span>
                </div>
                <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
              </div>
            ))}
          </div>
          {c.pillars?.foundational && (
            <p style={{ ...pStyle, marginTop: 18, fontSize: 14, color: '#94A3B8' }}>{c.pillars.foundational}</p>
          )}
        </Section>

        {/* 3. Verticals */}
        <Section id="verticals" title={c.verticals?.title}>
          <p style={pStyle}>{c.verticals?.intro}</p>
          <div style={{ display: 'grid', gap: 18 }}>
            {(c.verticals?.items || []).map((v, i) => (
              <div key={v.id || i} style={verticalCardStyle}>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: '#F8FAFC', marginTop: 0, marginBottom: 12 }}>{v.title}</h3>

                <div style={subhdStyle}>What they care about</div>
                <ul style={ulStyle}>
                  {(v.cares || []).map((x, j) => <li key={j} style={liStyle}>{x}</li>)}
                </ul>

                <div style={subhdStyle}>Pillars that resonate first</div>
                <p style={{ ...pStyle, fontSize: 14 }}>{v.pillars}</p>

                <div style={subhdStyle}>Qualifying questions</div>
                <ol style={olStyle}>
                  {(v.questions || []).map((q, j) => <li key={j} style={liStyle}>{q}</li>)}
                </ol>

                {v.disqualify && (
                  <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 12, fontStyle: 'italic' }}>
                    Disqualify gently if: {v.disqualify}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 4. Adjacent */}
        <Section id="adjacent" title={c.adjacent?.title}>
          <div style={{ display: 'grid', gap: 12 }}>
            {(c.adjacent?.items || []).map((a, i) => (
              <div key={i} style={pillarCardStyle}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', margin: 0, marginBottom: 6 }}>{a.name}</h4>
                <p style={{ fontSize: 14, color: '#CBD5E1', margin: 0, lineHeight: 1.6 }}>{a.frame}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 5. Screening */}
        <Section id="screening" title={c.screening?.title}>
          <p style={pStyle}>{c.screening?.intro}</p>
          <div style={subhdStyle}>{c.screening?.escalated_label}</div>
          <ul style={ulStyle}>
            {(c.screening?.escalated || []).map((x, i) => <li key={i} style={liStyle}>{x}</li>)}
          </ul>
          <div style={subhdStyle}>{c.screening?.captured_label}</div>
          <ol style={olStyle}>
            {(c.screening?.captured || []).map((x, i) => <li key={i} style={liStyle}>{x}</li>)}
          </ol>
        </Section>

        {/* 6. Elevator */}
        <Section id="elevator" title={c.elevator?.title}>
          <p style={pStyle}>{c.elevator?.intro}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {(c.elevator?.items || []).map((e, i) => (
              <div key={e.abbr || i} style={{ ...pillarCardStyle, padding: '12px 16px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#d4af37', marginRight: 10 }}>{e.abbr}</span>
                <span style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.5 }}>{e.line}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <footer style={{ marginTop: 60, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
          {c.footer?.line1 && <p style={{ margin: 0 }}>{c.footer.line1}</p>}
          {c.footer?.line2 && <p style={{ margin: '8px 0 0 0' }}>{c.footer.line2}</p>}
        </footer>
      </div>
    </div>
  );
}

const shellStyle = { minHeight: '100vh', background: 'var(--bg)', color: '#E5E7EB' };
const tocStyle = { background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 36 };
const tocLabelStyle = { fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37', margin: '0 0 10px 0' };
const linkStyle = { color: '#CBD5E1', textDecoration: 'none', padding: '4px 0', display: 'block' };
const pStyle = { fontSize: 15, color: '#CBD5E1', lineHeight: 1.7, margin: '0 0 14px 0' };
const subhdStyle = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94A3B8', marginTop: 14, marginBottom: 6, fontWeight: 700 };
const ulStyle = { margin: '0 0 8px 0', paddingLeft: 20 };
const olStyle = { margin: '0 0 8px 0', paddingLeft: 22 };
const liStyle = { fontSize: 14, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 6 };
const pillarCardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' };
const verticalCardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 14, padding: '20px 22px' };

function Section({ id, title, children }) {
  return (
    <section id={id} className="pb-anchor" style={{ marginBottom: 44 }}>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: '#F8FAFC', margin: '0 0 14px 0', borderBottom: '1px solid rgba(212,175,55,0.25)', paddingBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function Quote({ children }) {
  return (
    <blockquote style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontStyle: 'italic', color: '#F8FAFC', borderLeft: '3px solid #d4af37', paddingLeft: 18, margin: '0 0 18px 0', lineHeight: 1.5 }}>
      {children}
    </blockquote>
  );
}
