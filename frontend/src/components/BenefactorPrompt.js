import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { Button } from './ui/button';

export default function BenefactorPrompt({ onDismiss }) {
  const navigate = useNavigate();

  const handleCreate = () => {
    navigate('/create-estate');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto" data-testid="benefactor-prompt-overlay">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Glass panel */}
      <div
        className="relative w-full max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl animate-fade-in"
        style={{
          background: 'rgba(26, 31, 54, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(212, 175, 55, 0.2)',
        }}
      >
        {/* Close / Skip */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: 'var(--t4, #9ca3af)' }}
          data-testid="benefactor-prompt-close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)' }}
          >
            <Sparkles className="w-7 h-7" style={{ color: '#d4af37' }} />
          </div>
        </div>

        {/* Heading */}
        <h2
          className="text-xl sm:text-2xl font-bold text-center mb-2"
          style={{ color: 'var(--t, #fff)', fontFamily: 'var(--sans)' }}
        >
          Protect Your Own Legacy
        </h2>

        {/* Body */}
        <p
          className="text-sm text-center leading-relaxed mb-6"
          style={{ color: 'var(--t4, #9ca3af)' }}
        >
          You're connected to your family's estate plans — but what about yours?
          Create your own estate plan in minutes and give your loved ones the same
          peace of mind.
        </p>

        {/* CTA */}
        <Button
          onClick={handleCreate}
          className="w-full h-12 text-sm font-bold rounded-xl flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #d4af37, #b8942e)',
            color: '#0F1629',
          }}
          data-testid="benefactor-prompt-create-btn"
        >
          Create My Estate Plan <ArrowRight className="w-4 h-4" />
        </Button>

        {/* Skip */}
        <button
          onClick={onDismiss}
          className="w-full mt-3 py-2.5 text-sm font-medium rounded-xl transition-colors hover:bg-white/5"
          style={{ color: 'var(--t4, #9ca3af)' }}
          data-testid="benefactor-prompt-skip-btn"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
