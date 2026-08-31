import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import PublicFooter from '../components/PublicFooter';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, ExternalLink, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

/**
 * Public "Our Promise" page — renders the platform's Prime Directive
 * verbatim, sourced from the backend `/api/our-promise` endpoint.
 *
 * Designed for the lawyers, CPAs, estate planners, and wealth managers
 * a CarryOn user hands a generated PDF to. Plain, formal, no marketing
 * flourishes — the directive itself is the content. Link-shareable:
 * no auth, no telemetry, no popups, no banners.
 */
const OurPromisePage = () => {
  const [directive, setDirective] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/our-promise`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setDirective(data);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Unable to load.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      data-testid="our-promise-page"
      style={{
        minHeight: '100vh',
        background: '#FAF7F1',
        color: '#0F1629',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        padding: '64px 24px 96px',
      }}
    >
      <SEO title="Our Promise — CarryOn" description="The CarryOn Prime Directive: the standing commitment that governs every decision we make for the families who trust us." path="/our-promise" />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Eyebrow */}
        <div
          data-testid="our-promise-eyebrow"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: '#F5EBD3',
            border: '1px solid #D4AF37',
            borderRadius: 999,
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: '#7A5A12',
            marginBottom: 24,
          }}
        >
          <Lock size={12} strokeWidth={2.5} />
          Prime Directive — Locked, Verbatim
        </div>

        {/* Title */}
        <h1
          data-testid="our-promise-title"
          style={{
            fontSize: 36,
            lineHeight: 1.15,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: '0 0 16px 0',
          }}
        >
          Our Promise to Every Family on CarryOn™
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: '#3C4A5E',
            margin: '0 0 40px 0',
          }}
        >
          This is the founder's directive that shapes every product decision,
          every line of code, and every AI action on the platform. It is
          locked verbatim in our codebase and mechanically enforced before
          any change can ship.
        </p>

        {loadError && (
          <div
            data-testid="our-promise-error"
            style={{
              padding: 16,
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: 8,
              color: '#991B1B',
              fontSize: 14,
            }}
          >
            We couldn't load the directive right now ({loadError}). It is
            also published verbatim in our public source repository.
          </div>
        )}

        {!directive && !loadError && (
          <div
            data-testid="our-promise-loading"
            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6B7280' }}
          >
            <Loader2 size={16} className="animate-spin" />
            Loading the directive…
          </div>
        )}

        {directive && (
          <article
            data-testid="our-promise-directive"
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5DDC8',
              borderRadius: 12,
              padding: '40px 36px',
              boxShadow: '0 1px 2px rgba(15,22,41,0.04), 0 12px 32px rgba(15,22,41,0.06)',
            }}
          >
            <p
              data-testid="our-promise-opening"
              style={{ fontSize: 18, lineHeight: 1.6, fontWeight: 600, margin: '0 0 24px 0' }}
            >
              {directive.opening}
            </p>
            <p
              data-testid="our-promise-legacy-mandate"
              style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 20px 0' }}
            >
              {directive.legacy_mandate}
            </p>
            <p
              data-testid="our-promise-inclusivity-mandate"
              style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 28px 0' }}
            >
              {directive.inclusivity_mandate}
            </p>

            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#7A5A12',
                margin: '0 0 14px 0',
              }}
            >
              {directive.priority_preamble}
            </p>

            <ol
              data-testid="our-promise-priorities"
              style={{
                paddingLeft: 22,
                margin: '0 0 16px 0',
                fontSize: 16,
                lineHeight: 1.7,
              }}
            >
              {directive.priorities.map((p) => (
                <li
                  key={p.n}
                  data-testid={`our-promise-priority-${p.n}`}
                  style={{ marginBottom: 8 }}
                >
                  {p.text}
                </li>
              ))}
            </ol>

            <div
              style={{
                marginTop: 32,
                paddingTop: 20,
                borderTop: '1px solid #E5DDC8',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: '#6B7280',
              }}
            >
              <ShieldCheck size={14} strokeWidth={2.25} />
              Locked {directive.locked_at}. Enforced at every commit by automated
              integrity gates.
            </div>
          </article>
        )}

        {/* Footer / cross-links — short, formal, no funnel CTAs */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            fontSize: 14,
          }}
        >
          <Link
            to="/privacy"
            data-testid="our-promise-link-privacy"
            style={{ color: '#0F1629', textDecoration: 'underline' }}
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            data-testid="our-promise-link-terms"
            style={{ color: '#0F1629', textDecoration: 'underline' }}
          >
            Terms of Service
          </Link>
          <Link
            to="/about"
            data-testid="our-promise-link-about"
            style={{ color: '#0F1629', textDecoration: 'underline' }}
          >
            About CarryOn
          </Link>
          <a
            href="/api/our-promise"
            data-testid="our-promise-link-api"
            style={{
              color: '#0F1629',
              textDecoration: 'underline',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Raw API <ExternalLink size={12} />
          </a>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
};

export default OurPromisePage;
