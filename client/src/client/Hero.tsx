import type { ReactNode } from 'react';

// Black brand band for the moments that matter: welcome, check, and done. Question screens stay white.
// Two-beat headline: a white line, then a grey line, like the Creative Studio hero.
export function Hero({ eyebrow, line1, line2, children, steps }: { eyebrow: string; line1: string; line2?: string; children?: ReactNode; steps?: string[] }) {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero-inner">
        <p className="hero-eyebrow">{eyebrow}</p>
        <h1 id="hero-h" className="hero-title" tabIndex={-1}>
          <span className="l1">{line1}</span>
          {line2 && <span className="l2">{line2}</span>}
        </h1>
        {children && <div className="hero-sub">{children}</div>}
        {steps && (
          <ol className="hero-steps">
            {steps.map((s, i) => (
              <li key={s}><span className="hs-num">{String(i + 1).padStart(2, '0')}</span><span className="hs-text">{s}</span></li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
