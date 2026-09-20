import React from 'react';
import { useCopy, renderCopy, copyList } from '../../copy/CopyContext';
import { SourceRef } from '../landing/SourceRef';

const IMG = '/founder-images/';
const GOLD = 'text-[#d4a029] italic font-normal';
const WHITE = 'text-white font-semibold';
const GRADIENT = { background: 'linear-gradient(135deg,#d4a029,#e6b84d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const TINT = 'rgba(30,48,80,0.3)';

const Section = ({ id, bg, tint = false, children }) => (
  <section className="relative overflow-hidden py-12" style={tint ? { background: TINT } : undefined} data-testid={`founder-story-${id}`}>
    {bg && (
      <div className="absolute inset-0" aria-hidden="true">
        <img src={`${IMG}${bg.file}`} alt="" className="w-full h-full object-cover" style={bg.style} loading="lazy" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,#0d1b2a,transparent,#0d1b2a)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right,rgba(13,27,42,0.5),transparent,rgba(13,27,42,0.5))' }} />
        {bg.darkMobile && <div className="absolute inset-0 bg-[rgba(13,27,42,0.4)] md:bg-transparent" />}
      </div>
    )}
    <div className="relative z-[1] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

const H2 = ({ k, t }) => <h2 className="text-3xl font-bold text-center text-white mb-8" data-testid={`${k.split('.')[2]}-title`}>{t(k)}</h2>;

const Paras = ({ keys, t, refs = {} }) => (
  <div className="max-w-4xl mx-auto">
    {keys.map((k, i) => (
      <p key={k} className={`text-[#9aa5b4] text-lg leading-[1.8] ${i < keys.length - 1 ? 'mb-6' : ''}`}>{renderCopy(t(k), GOLD)}{refs[k]}</p>
    ))}
  </div>
);

const Quote = ({ k, t, className = '' }) => (
  <div className={`max-w-3xl mx-auto text-center rounded-r-lg p-4 ${className}`} style={{ borderLeft: '4px solid #d4a029', background: 'rgba(30,48,80,0.5)' }}>
    <p className="text-white text-lg italic">{renderCopy(t(k))}</p>
  </div>
);

const Centered = ({ k, t, className = '' }) => (
  <p className={`text-white text-center italic mt-8 ${className}`}>{renderCopy(t(k))}</p>
);

/** The founder's story, every string read from Site Copy (`founder.story.*`). Photos are fixed assets. */
export const FounderStory = () => {
  const { t } = useCopy();
  return (
    <main data-testid="founder-story">
      <section className="relative overflow-hidden pb-16 text-center" style={{ paddingTop: 'calc(8rem + env(safe-area-inset-top, 0px))', background: 'linear-gradient(to bottom,#091524,#0d1b2a,#0d1b2a)' }} data-testid="founder-story-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4" data-testid="founder-story-h1">
            {t('founder.story.hero.h1a')}<br /><span style={GRADIENT}>{t('founder.story.hero.h1b')}</span>
          </h1>
          <div className="h-1 w-24 mx-auto mb-6" style={{ background: '#d4a029' }} />
          <p className="text-[#9aa5b4] font-bold italic max-w-2xl mx-auto" data-testid="founder-story-byline">{t('founder.story.hero.byline')}</p>
          <p className="text-[#9aa5b4] text-lg italic max-w-4xl mx-auto mt-10">{renderCopy(t('founder.story.hero.epigraph'))}</p>
        </div>
      </section>

      <Section id="origins" bg={{ file: 'founder-cd32731b9d.jpg', style: { objectPosition: 'center' } }}>
        <H2 k="founder.story.origins.title" t={t} />
        <Paras keys={['founder.story.origins.p1', 'founder.story.origins.p2']} t={t} />
      </Section>

      <Section id="father" bg={{ file: 'founder-f241ad9c4c.jpg', style: { objectPosition: 'center', opacity: 0.9 }, darkMobile: true }}>
        <H2 k="founder.story.father.title" t={t} />
        <Paras keys={['founder.story.father.p1', 'founder.story.father.p2', 'founder.story.father.p3']} t={t} />
      </Section>

      <Section id="son" bg={{ file: 'founder-8d0141dd66.jpg', style: { objectPosition: 'center 40%', filter: 'brightness(0.6)' } }}>
        <H2 k="founder.story.son.title" t={t} />
        <Paras keys={['founder.story.son.p1', 'founder.story.son.p2', 'founder.story.son.p3', 'founder.story.son.p4']} t={t} />
      </Section>

      <Section id="center" bg={{ file: 'founder-7396c00120.jpg', style: { objectPosition: 'center 25%', filter: 'sepia(100%) saturate(300%) brightness(0.4) hue-rotate(180deg)' } }}>
        <H2 k="founder.story.center.title" t={t} />
        <Paras keys={['founder.story.center.p1', 'founder.story.center.p2', 'founder.story.center.p3']} t={t} />
        <Quote k="founder.story.center.quote" t={t} className="mt-8" />
      </Section>

      <Section id="realization" tint>
        <H2 k="founder.story.realization.title" t={t} />
        <Paras keys={['founder.story.realization.p1', 'founder.story.realization.p2', 'founder.story.realization.p3']} t={t} />
      </Section>

      <Section id="threads">
        <H2 k="founder.story.threads.title" t={t} />
        <div className="max-w-3xl mx-auto text-center space-y-4">
          {['1', '2', '3'].map(n => <p key={n} className="text-[#9aa5b4] text-lg">{renderCopy(t(`founder.story.threads.${n}`), GOLD)}</p>)}
        </div>
      </Section>

      <Section id="born" tint>
        <h2 className="text-3xl sm:text-4xl font-bold text-center" style={GRADIENT} data-testid="born-title">{t('founder.story.born.title')}</h2>
        <img src={`${IMG}founder-d3c4456079.jpg`} alt="CarryOn Technologies logo" className="w-64 h-64 object-contain mx-auto mt-8 block" loading="lazy" />
      </Section>

      <Section id="idea">
        <H2 k="founder.story.idea.title" t={t} />
        <Paras keys={['founder.story.idea.p1', 'founder.story.idea.p2']} t={t} />
        <Centered k="founder.story.idea.closing" t={t} className="text-xl font-semibold max-w-4xl mx-auto" />
      </Section>

      <Section id="platform" tint>
        <H2 k="founder.story.platform.title" t={t} />
        <div className="max-w-4xl mx-auto">
          <p className="text-[#9aa5b4] text-lg leading-[1.8] mb-6">{renderCopy(t('founder.story.platform.intro'), GOLD)}</p>
          <ul className="space-y-4" data-testid="founder-story-platform-items">
            {copyList(t('founder.story.platform.items')).map((item, i) => (
              <li key={i} className="flex gap-3 text-[#9aa5b4] text-lg leading-[1.8]"><span className="text-[#d4a029] font-bold">•</span><span>{renderCopy(item, WHITE)}</span></li>
            ))}
          </ul>
          <Centered k="founder.story.platform.closing" t={t} className="text-lg font-medium" />
        </div>
      </Section>

      <Section id="how">
        <H2 k="founder.story.how.title" t={t} />
        <ol className="max-w-4xl mx-auto space-y-4" data-testid="founder-story-how-steps">
          {copyList(t('founder.story.how.steps')).map((step, i) => (
            <li key={i} className="flex gap-4 text-[#9aa5b4] text-lg leading-[1.8]"><span className="text-[#d4a029] font-bold text-xl">{i + 1}.</span><span>{renderCopy(step, WHITE)}</span></li>
          ))}
        </ol>
      </Section>

      <Section id="why" tint>
        <H2 k="founder.story.why.title" t={t} />
        <Paras keys={['founder.story.why.p1', 'founder.story.why.p2', 'founder.story.why.p3']} t={t} refs={{ 'founder.story.why.p1': <SourceRef id="will" n={2} testIdSuffix="-founder" /> }} />
      </Section>

      <Section id="promise">
        <H2 k="founder.story.promise.title" t={t} />
        <Paras keys={['founder.story.promise.p1', 'founder.story.promise.p2']} t={t} />
        <Quote k="founder.story.promise.quote" t={t} className="my-8" />
        <Paras keys={['founder.story.promise.p3', 'founder.story.promise.p4']} t={t} />
      </Section>

      <Section id="closing" tint>
        <p className="text-2xl sm:text-3xl font-bold text-center text-white max-w-4xl mx-auto leading-relaxed py-4" data-testid="founder-story-closing">
          {t('founder.story.closing.l1')}<br /><span style={GRADIENT}>{t('founder.story.closing.l2')}</span>
        </p>
      </Section>
    </main>
  );
};

export default FounderStory;
