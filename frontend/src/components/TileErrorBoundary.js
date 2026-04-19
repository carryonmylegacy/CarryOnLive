import React from 'react';
import { reportError } from '../utils/errorReporter';

/**
 * TileErrorBoundary — per-widget error containment.
 *
 * Wraps an individual dashboard tile, modal section, or widget so that
 * a runtime error in *that* tile does not unmount the entire page.
 * Falls back to a compact, theme-aware placeholder that matches the
 * CarryOn glass-card aesthetic and offers a single "Retry" affordance
 * which remounts the wrapped subtree without reloading the app.
 *
 * Usage:
 *   <TileErrorBoundary name="readiness-widget">
 *     <ReadinessWidget />
 *   </TileErrorBoundary>
 */
class TileErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, retryKey: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const tileName = this.props.name || 'UnnamedTile';
    const trace = info?.componentStack?.split('\n')[1]?.trim() || '';
    reportError(error, `Tile:${tileName}${trace ? `@${trace}` : ''}`);
  }

  handleRetry = () => {
    this.setState((prev) => ({ hasError: false, retryKey: prev.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid={`tile-error-${this.props.name || 'unnamed'}`}
          className="rounded-2xl p-5 flex flex-col items-center justify-center text-center"
          style={{
            background: 'var(--bg2, rgba(15,22,41,0.7))',
            border: '1px solid var(--border, rgba(255,255,255,0.08))',
            color: 'var(--t, #fff)',
            minHeight: 120,
          }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--t, #fff)' }}>
            This tile hit a snag
          </p>
          <p className="text-xs opacity-70 mb-3" style={{ color: 'var(--t2, #cbd5e1)' }}>
            The rest of the page is fine.
          </p>
          <button
            data-testid={`tile-error-retry-${this.props.name || 'unnamed'}`}
            onClick={this.handleRetry}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: '#d4af37', color: '#080e1a' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

export default TileErrorBoundary;
