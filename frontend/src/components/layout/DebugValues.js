/**
 * DebugValues — dev-only safe-area / viewport debugger overlay.
 * Extracted from MobileNav.js for clarity. Only rendered when showDebug=true.
 */
import React from 'react';

const DebugValues = () => {
  const [vals, setVals] = React.useState({});
  React.useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (prop) => cs.getPropertyValue(prop) || '0px';
    const headerEl = document.querySelector('.mobile-header');
    const headerStyle = headerEl ? getComputedStyle(headerEl) : null;
    const bottomNavEl = document.querySelector('.mobile-bottom-nav');
    const bottomNavStyle = bottomNavEl ? getComputedStyle(bottomNavEl) : null;
    setVals({
      sat: get('env(safe-area-inset-top)'),
      sab: get('env(safe-area-inset-bottom)'),
      headerPt: headerStyle?.paddingTop || 'N/A',
      headerH: headerEl?.offsetHeight || 'N/A',
      headerMb: headerStyle?.marginBottom || '0',
      bottomNavH: bottomNavEl?.offsetHeight || 'N/A',
      bottomNavPb: bottomNavStyle?.paddingBottom || 'N/A',
      dpr: window.devicePixelRatio,
      screenW: window.screen.width,
      screenH: window.screen.height,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      viewportCovers: window.innerHeight >= (window.screen.height - 10) ? 'YES' : 'NO',
      isNativeApp: document.body.classList.contains('native-app') ? 'YES' : 'NO',
      ua: navigator.userAgent.slice(0, 80),
    });
  }, []);

  const [measuredTop, setMeasuredTop] = React.useState('N/A');
  const [measuredBottom, setMeasuredBottom] = React.useState('N/A');
  React.useEffect(() => {
    const divTop = document.createElement('div');
    divTop.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:1px;pointer-events:none;';
    const divBottom = document.createElement('div');
    divBottom.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom,0px);width:1px;pointer-events:none;';
    document.body.appendChild(divTop);
    document.body.appendChild(divBottom);
    setTimeout(() => {
      setMeasuredTop(divTop.offsetHeight + 'px');
      setMeasuredBottom(divBottom.offsetHeight + 'px');
      document.body.removeChild(divTop);
      document.body.removeChild(divBottom);
    }, 100);
  }, []);

  const row = (label, value, highlight) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ color: '#aaa', fontSize: '12px' }}>{label}</span>
      <span style={{ color: highlight ? '#E0AD2B' : '#4ade80', fontSize: '12px', fontWeight: 'bold', maxWidth: '180px', wordBreak: 'break-all', textAlign: 'right' }}>{String(value)}</span>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Top Spacing</div>
      {row('safe-area-inset-top (CSS)', vals.sat)}
      {row('safe-area-inset-top (measured)', measuredTop, true)}
      {row('Header paddingTop', vals.headerPt)}
      {row('Header total height', vals.headerH + 'px')}
      <div style={{ height: 12 }} />
      <div style={{ fontSize: '11px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Bottom Spacing</div>
      {row('safe-area-inset-bottom (CSS)', vals.sab)}
      {row('safe-area-inset-bottom (measured)', measuredBottom, true)}
      {row('Bottom Nav height', vals.bottomNavH + 'px')}
      {row('Bottom Nav paddingBottom', vals.bottomNavPb)}
      <div style={{ height: 12 }} />
      <div style={{ fontSize: '11px', color: '#E0AD2B', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '8px' }}>Device</div>
      {row('viewport-fit=cover?', vals.viewportCovers)}
      {row('Native app?', vals.isNativeApp)}
      {row('DPR', vals.dpr)}
      {row('Screen', `${vals.screenW}x${vals.screenH}`)}
      {row('Viewport', `${vals.innerW}x${vals.innerH}`)}
      <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
        <span style={{ color: '#aaa', fontSize: '11px', wordBreak: 'break-all' }}>{vals.ua}</span>
      </div>
    </div>
  );
};

export default DebugValues;
