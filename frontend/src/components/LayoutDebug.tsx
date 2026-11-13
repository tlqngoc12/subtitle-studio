// TEMP(debug-ios-fullscreen): remove after the iPhone filled-fullscreen shift is diagnosed.
import { useEffect, useRef, useState } from 'react';
import './LayoutDebug.css';

const params = () => new URLSearchParams(window.location.search);
const r1 = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? 'n/a' : String(Math.round(n * 10) / 10));
const rect = (el: Element | null | undefined) => {
  if (!el) return 'none';
  const b = el.getBoundingClientRect();
  return `l${r1(b.left)} t${r1(b.top)} w${r1(b.width)} h${r1(b.height)}`;
};

export function LayoutDebug({ filled }: { filled: boolean }) {
  const enabled = params().get('debug') === 'layout';
  const fitAuto = enabled && params().get('fit') === 'auto';
  const rootRef = useRef<HTMLPreElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState('');

  // fit=auto experiment: while filled, drop viewport-fit=cover and paint html/body black.
  useEffect(() => {
    if (!fitAuto || !filled) return;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute('content') ?? null;
    if (meta && original !== null) {
      meta.setAttribute(
        'content',
        original
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '' && !s.startsWith('viewport-fit'))
          .join(', '),
      );
    }
    const html = document.documentElement.style.background;
    const body = document.body.style.background;
    document.documentElement.style.background = '#000';
    document.body.style.background = '#000';
    return () => {
      if (meta && original !== null) meta.setAttribute('content', original);
      document.documentElement.style.background = html;
      document.body.style.background = body;
    };
  }, [fitAuto, filled]);

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const de = document.documentElement;
      const vv = window.visualViewport;
      const cs = probeRef.current ? getComputedStyle(probeRef.current) : null;
      const frame = rootRef.current?.closest('.player') ?? null;
      const s = window.screen;
      const lines = [
        `filled ${frame?.classList.contains('player--filled') ?? false}`,
        `screen ${s.width}x${s.height} dpr ${r1(window.devicePixelRatio)}`,
        `orient ${s.orientation?.type ?? 'n/a'} / ${String((window as unknown as { orientation?: number }).orientation)}`,
        `inner ${r1(window.innerWidth)}x${r1(window.innerHeight)}`,
        `client ${r1(de.clientWidth)}x${r1(de.clientHeight)} scrollW ${r1(de.scrollWidth)}`,
        `scroll ${r1(window.scrollX)},${r1(window.scrollY)}`,
        `vv ${r1(vv?.width)}x${r1(vv?.height)} off ${r1(vv?.offsetLeft)},${r1(vv?.offsetTop)}`,
        `vv pageLeft ${r1(vv?.pageLeft)} scale ${r1(vv?.scale)}`,
        `safe T${cs?.paddingTop} R${cs?.paddingRight} B${cs?.paddingBottom} L${cs?.paddingLeft}`,
        `player ${rect(frame)}`,
        `iframe ${rect(frame?.querySelector('.player__video iframe'))}`,
        `meta ${document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? 'none'}`,
      ];
      setText(lines.join('\n'));
    };
    update();
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    const id = window.setInterval(update, 1000);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.clearInterval(id);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <span className="layout-debug__probe" ref={probeRef} />
      <pre className="layout-debug" ref={rootRef}>
        {text}
      </pre>
    </>
  );
}
