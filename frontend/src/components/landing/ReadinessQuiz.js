import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ChevronRight, ChevronLeft, RotateCcw, Timer, Wrench, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../../config';
import { RevealSection } from './RevealSection';

const QUESTIONS = [
  { q: 'If something happened to you tonight, would your spouse or a trusted person know where your will is \u2014 or that you don\u2019t have one?',
    fix: 'Put your will (or a note that you still need one) in the Document Vault and share it with one person.' },
  { q: 'Could your family find your life insurance policy and the claims phone number within an hour?',
    fix: 'Upload the policy. Estate Guardian\u2122 pulls the claims number straight into your family\u2019s first-steps list.' },
  { q: 'Does anyone besides you know how to get into your phone, email, and main bank account?',
    fix: 'Save those logins in Passwords & Accounts and assign each one to a specific person.' },
  { q: 'Have you written down who to call first \u2014 attorney, insurance agent, employer, closest family?',
    fix: 'Build your Who-to-Call list, with a ranked backup for each person.' },
  { q: 'Is there a step-by-step list your family could follow in the first 72 hours?',
    fix: 'Start your What-to-Do-First checklist. CarryOn drafts it from your documents; you finish it in your words.' },
  { q: 'Are your important papers in one place \u2014 not spread across drawers, email, and a safe deposit box?',
    fix: 'Move everything into one encrypted vault your family can actually reach.' },
  { q: 'Have you recorded anything for the people you love \u2014 a note, a voice memo, a video \u2014 for moments you might miss?',
    fix: 'Record one Milestone Message. It takes about two minutes.' },
  { q: 'If you were unreachable for two weeks, could someone step in and keep the mortgage and bills paid?',
    fix: 'Set up Emergency Access and list your recurring bills in the Financial Portal.' },
];

const OPTIONS = [
  { label: 'Yes', value: 2 },
  { label: 'Partly / not sure', value: 1 },
  { label: 'No', value: 0 },
];

const tierFor = (score) => {
  if (score >= 75) return { title: 'You\u2019re ahead of most families.', color: '#10b981', msg: 'Nice work. The last mile is making sure it all lives in one place your family can reach \u2014 not just in your head or a drawer.' };
  if (score >= 40) return { title: 'You\u2019ve started. There are gaps.', color: '#d4af37', msg: 'You\u2019ve done more than most. But the gaps below are exactly the ones families trip over in the first week.' };
  return { title: 'Your family would be searching.', color: '#f87171', msg: 'That\u2019s where almost everyone starts. The good news: the fixes below take about an hour, total.' };
};

const ScoreRing = ({ score, color }) => {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative w-[150px] h-[150px] mx-auto" data-testid="quiz-score-ring">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white text-4xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="quiz-score-value">{score}</span>
        <span className="text-[#8b97ab] text-xs">out of 100</span>
      </div>
    </div>
  );
};

const Intro = ({ onStart }) => (
  <div className="text-center" data-testid="quiz-intro">
    <p className="text-[#a0aec0] text-base leading-relaxed mb-8 max-w-[520px] mx-auto">
      Eight quick questions about where things stand today. No email, no sign-up &mdash; just an honest score and the three things to fix first.
    </p>
    <button onClick={onStart} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="quiz-start-btn">
      Start the quiz <ChevronRight className="w-4 h-4" />
    </button>
    <p className="flex items-center justify-center gap-1.5 text-[#6b7a90] text-xs mt-4"><Timer className="w-3.5 h-3.5" /> About 60 seconds</p>
  </div>
);

const Question = ({ index, answer, onAnswer, onBack }) => (
  <div data-testid="quiz-question">
    <div className="flex items-center justify-between text-xs text-[#8b97ab] mb-2">
      <span data-testid="quiz-progress-label">Question {index + 1} of {QUESTIONS.length}</span>
      {index > 0 && <button onClick={onBack} className="flex items-center gap-1 hover:text-white transition-colors" data-testid="quiz-back-btn"><ChevronLeft className="w-3.5 h-3.5" /> Back</button>}
    </div>
    <div className="h-1.5 rounded-full mb-7 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(index / QUESTIONS.length) * 100}%`, background: '#d4af37' }} />
    </div>
    <p className="text-white text-lg sm:text-xl font-semibold leading-snug mb-7 min-h-[3.5rem]" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="quiz-question-text">{QUESTIONS[index].q}</p>
    <div className="grid gap-3">
      {OPTIONS.map(opt => (
        <button key={opt.label} onClick={() => onAnswer(opt.value)} data-testid={`quiz-option-${opt.value}`}
          className="w-full text-left px-5 py-3.5 rounded-xl text-base font-medium transition-colors duration-200 hover:border-[#d4af37]/60"
          style={answer === opt.value ? { background: 'rgba(212,175,55,0.16)', border: '1px solid rgba(212,175,55,0.6)', color: '#fcd34d' } : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const EmailCapture = ({ resultId }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!resultId) { setError('Please wait a moment and try again.'); return; }
    setStatus('sending'); setError('');
    try {
      await axios.post(`${API_URL}/quiz/results/${resultId}/email`, { email });
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    }
  };
  if (status === 'sent') {
    return (
      <p className="flex items-center justify-center gap-2 text-[#10b981] text-sm font-medium" data-testid="quiz-email-sent">
        <CheckCircle2 className="w-4 h-4" /> Sent to {email}. Check your inbox.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="text-left" data-testid="quiz-email-form">
      <p className="text-white text-sm font-semibold mb-1 flex items-center gap-2"><Mail className="w-4 h-4 text-[#d4af37]" /> Want this in your inbox?</p>
      <p className="text-[#8b97ab] text-xs mb-3">We&apos;ll email your score and the fixes above so you can come back to them.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" data-testid="quiz-email-input"
          className="flex-1 h-11 px-4 rounded-lg text-base text-white placeholder:text-[#4a5568] focus:outline-none focus:border-[#d4af37]"
          style={{ background: 'rgba(11,19,34,0.8)', border: '1px solid rgba(255,255,255,0.12)' }} />
        <button type="submit" disabled={status === 'sending'} data-testid="quiz-email-submit"
          className="h-11 px-5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-60"
          style={{ background: 'rgba(212,175,55,0.16)', border: '1px solid rgba(212,175,55,0.5)', color: '#fcd34d' }}>
          {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send it'}
        </button>
      </div>
      {error && <p className="text-[#f87171] text-xs mt-2" data-testid="quiz-email-error">{error}</p>}
      <p className="text-[#6b7a90] text-[11px] mt-2">One email with your results, plus occasional CarryOn updates. Unsubscribe anytime.</p>
    </form>
  );
};

const Result = ({ answers, resultId, onRetake, onStart }) => {
  const score = Math.round((answers.reduce((a, b) => a + b, 0) / (QUESTIONS.length * 2)) * 100);
  const tier = tierFor(score);
  const fixes = answers.map((v, i) => ({ v, i })).filter(x => x.v < 2).sort((a, b) => a.v - b.v).slice(0, 3).map(x => QUESTIONS[x.i].fix);
  return (
    <div data-testid="quiz-result">
      <ScoreRing score={score} color={tier.color} />
      <h3 className="text-white text-2xl sm:text-3xl font-bold text-center mt-5 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="quiz-result-title">{tier.title}</h3>
      <p className="text-[#a0aec0] text-base text-center leading-relaxed max-w-[560px] mx-auto mb-8">{tier.msg}</p>
      {fixes.length > 0 && (
        <div className="rounded-xl p-5 mb-8 text-left" style={{ background: 'rgba(15,26,46,0.7)', border: '1px solid rgba(212,175,55,0.2)' }} data-testid="quiz-fixes">
          <p className="flex items-center gap-2 text-[#d4af37] text-xs font-bold uppercase tracking-wider mb-3"><Wrench className="w-3.5 h-3.5" /> Fix these first</p>
          <ol className="space-y-3">
            {fixes.map((f, i) => (
              <li key={i} className="flex gap-3 text-[#e2e8f0] text-sm leading-relaxed">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.14)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}>{i + 1}</span>
                {f}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="rounded-xl p-5 mb-8" style={{ background: 'rgba(11,19,34,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <EmailCapture resultId={resultId} />
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button onClick={() => onStart(score)} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base transition-transform duration-150 active:scale-95" style={{ background: '#d4af37', color: '#0B1221' }} data-testid="quiz-start-carryon-btn">
          {fixes.length > 0 ? 'Fix these now' : 'Put it all in one place'} <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={onRetake} className="inline-flex items-center gap-1.5 text-[#8b97ab] text-sm hover:text-white transition-colors" data-testid="quiz-retake-btn"><RotateCcw className="w-3.5 h-3.5" /> Retake</button>
      </div>
      <p className="text-center text-[#6b7a90] text-xs mt-4">Every plan starts with an exploration period. Cancel anytime.</p>
    </div>
  );
};

export const ReadinessQuiz = ({ navigateWithFade, testIdSuffix = '' }) => {
  const [stage, setStage] = useState('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [resultId, setResultId] = useState(null);

  useEffect(() => {
    if (stage !== 'result') return;
    const utm = JSON.parse(sessionStorage.getItem('carryon_utm') || '{}');
    axios.post(`${API_URL}/quiz/results`, { answers, utm, page: window.location.pathname })
      .then(r => setResultId(r.data.id))
      .catch(() => {});
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (value) => {
    const next = [...answers]; next[index] = value; setAnswers(next);
    setTimeout(() => (index + 1 < QUESTIONS.length ? setIndex(index + 1) : setStage('result')), 220);
  };
  const retake = () => { setAnswers([]); setIndex(0); setResultId(null); setStage('intro'); };
  const start = (score) => {
    sessionStorage.setItem('carryon_quiz_score', String(score));
    navigateWithFade(`/start?utm_source=readiness_quiz&utm_medium=homepage&utm_content=score_${score}`);
  };

  return (
    <section id="quiz" className="relative z-[15] -mt-1" data-testid={`readiness-quiz${testIdSuffix}`}>
      <div className="rounded-t-[2rem] py-20 lg:py-28 relative overflow-hidden" style={{ background: '#0D1B2A', boxShadow: '0 -16px 50px rgba(0,0,0,0.4)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(212,175,55,0.07) 0%, transparent 60%)' }} />
        <div className="max-w-[720px] mx-auto px-6 relative z-10">
          <RevealSection>
            <p className="text-[#d4af37] text-xs font-bold uppercase tracking-[0.2em] text-center mb-3">60-second check</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white text-center mb-8" style={{ fontFamily: 'Outfit, sans-serif' }}>
              How ready is your family?
            </h2>
          </RevealSection>
          <RevealSection delay={0.1} distance={30}>
            <div className="rounded-2xl p-6 sm:p-8 lg:p-10" style={{ background: 'linear-gradient(160deg, #1a2d4d 0%, #16284a 50%, #142240 100%)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              {stage === 'intro' && <Intro onStart={() => setStage('quiz')} />}
              {stage === 'quiz' && <Question index={index} answer={answers[index]} onAnswer={answer} onBack={() => setIndex(index - 1)} />}
              {stage === 'result' && <Result answers={answers} resultId={resultId} onRetake={retake} onStart={start} />}
            </div>
          </RevealSection>
        </div>
      </div>
    </section>
  );
};

export default ReadinessQuiz;
