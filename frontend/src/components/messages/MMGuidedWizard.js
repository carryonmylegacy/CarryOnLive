import React from 'react';
import { ArrowLeft, ArrowRight, Check, Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

/**
 * MMGuidedWizard — pure presentational 3-step Milestone Message wizard.
 *
 * Used by the "Getting Started" path when the user has zero messages and
 * needs hand-holding. Owns NO state — every value (title, content,
 * selected recipients, etc.) and every callback (handleCreate, setTitle,
 * etc.) comes from the parent.
 *
 * Extracted from MessagesPage.js (Apr 2026 refactor) WITHOUT moving any
 * logic. Just JSX.
 */
const MMGuidedWizard = ({
  guidedStep, setGuidedStep,
  title, setTitle,
  content, setContent,
  toggleSpeechToText, isSpeechListening,
  beneficiaries, selectedRecipients, setSelectedRecipients,
  handleCreate, creating,
}) => (
  <div className="space-y-6" data-testid="guided-message-wizard">
    {/* Progress dots */}
    <div className="flex items-center justify-center gap-3 pb-2">
      {[1, 2, 3].map(s => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
            guidedStep > s ? 'bg-[#10b981] text-white' :
            guidedStep === s ? 'bg-[var(--gold)] text-[#080e1a] ring-4 ring-[var(--gold)]/20' :
            'bg-[var(--s)] text-[var(--t5)]'
          }`}>
            {guidedStep > s ? <Check className="w-4 h-4" /> : s}
          </div>
          {s < 3 && <div className={`w-8 h-0.5 rounded-full transition-colors ${guidedStep > s ? 'bg-[#10b981]' : 'bg-[var(--b)]'}`} />}
        </div>
      ))}
    </div>

    {/* Step 1: Title */}
    {guidedStep === 1 && (
      <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-1">
        <div className="rounded-2xl p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
            Give your message a name
          </h3>
          <p className="text-sm text-[var(--t4)] leading-relaxed">
            This is just a label so you can find it later. Something simple like "To my family" or "Happy Birthday" works great.
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-[var(--t3)] text-base font-bold">Message Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g., "To my family" or "Happy 30th Birthday"'
            className="input-field text-base h-14"
            data-testid="message-title-input"
            autoFocus
          />
        </div>
        <Button
          onClick={() => setGuidedStep(2)}
          disabled={!title.trim()}
          className="w-full h-14 text-base gold-button"
          data-testid="guided-next-1"
        >
          Next — Write Your Message <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    )}

    {/* Step 2: Content */}
    {guidedStep === 2 && (
      <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-2">
        <div className="rounded-2xl p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
            Write your message
          </h3>
          <p className="text-sm text-[var(--t4)] leading-relaxed">
            Write whatever is in your heart. You can always come back and change it later — nothing is permanent.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[var(--t3)] text-base font-bold">Your Message</Label>
            <span className="text-xs text-[var(--t5)] px-2 py-1 rounded-lg bg-[var(--s)]">
              "{title}"
            </span>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your heartfelt message here..."
            className="input-field min-h-[180px] text-base leading-relaxed"
            data-testid="message-content-input"
            autoFocus
          />
          <button type="button" onClick={toggleSpeechToText}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl transition-colors ${isSpeechListening ? 'bg-red-500/20 text-red-400' : 'text-[var(--t5)] hover:text-[var(--t3)] hover:bg-[var(--s)]'}`}
            data-testid="message-mic-button">
            {isSpeechListening ? <><MicOff className="w-4 h-4" /> Stop Dictation</> : <><Mic className="w-4 h-4" /> Speak Instead of Typing</>}
          </button>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setGuidedStep(1)}
            className="border-[var(--b)] text-[var(--t3)] h-14 px-6"
            data-testid="guided-back-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            onClick={() => {
              // Ensure all beneficiaries are selected
              if (beneficiaries.length > 0 && selectedRecipients.length === 0) {
                setSelectedRecipients(beneficiaries.map(b => b.user_id || b.id));
              }
              setGuidedStep(3);
            }}
            disabled={!content.trim()}
            className="flex-1 h-14 text-base gold-button"
            data-testid="guided-next-2"
          >
            Next — Review & Save <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    )}

    {/* Step 3: Review & Save */}
    {guidedStep === 3 && (
      <div className="space-y-4 animate-in fade-in duration-300" data-testid="guided-step-3">
        <div className="rounded-2xl p-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <h3 className="text-lg font-bold text-[var(--t)] mb-2" style={{ fontFamily: 'var(--sans)' }}>
            Almost done — review your message
          </h3>
          <p className="text-sm text-[var(--t4)] leading-relaxed">
            Everything looks good? Just tap "Save Message" below. You can always edit it later.
          </p>
        </div>

        {/* Preview card */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--s)', border: '1px solid var(--b)' }}>
          <div>
            <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Title</p>
            <p className="text-base font-bold text-[var(--t)]">{title}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Message</p>
            <p className="text-sm text-[var(--t3)] whitespace-pre-wrap leading-relaxed">{content.length > 200 ? content.slice(0, 200) + '...' : content}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Sending To</p>
            <div className="flex flex-wrap gap-2">
              {beneficiaries.filter(b => selectedRecipients.includes(b.user_id || b.id)).map(b => (
                <span key={b.id} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
                  {b.name}
                </span>
              ))}
              {selectedRecipients.length === 0 && (
                <span className="text-xs text-[var(--t5)]">All your beneficiaries</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--t5)] uppercase tracking-wider mb-1">Delivery</p>
            <p className="text-sm text-[var(--t3)]">When your estate transitions to your beneficiaries</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setGuidedStep(2)}
            className="border-[var(--b)] text-[var(--t3)] h-14 px-6"
            data-testid="guided-back-3"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 h-14 text-base gold-button"
            data-testid="create-message-submit"
          >
            {creating ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Check className="w-5 h-5 mr-2" /> Save Message</>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-[var(--t5)] leading-relaxed">
          You can edit this message anytime, add a video or voice recording, and change the delivery settings later.
        </p>
      </div>
    )}
  </div>
);

export default MMGuidedWizard;
