import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

/** The text of every `@media <media>` block (braces matched), or the whole stylesheet when no media is given. */
function scopes(media?: string): string[] {
  if (!media) return [css];
  const blocks: string[] = [];
  const head = `@media ${media} {`;
  for (let at = css.indexOf(head); at >= 0; at = css.indexOf(head, at + 1)) {
    let depth = 0;
    let end = at + head.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    blocks.push(css.slice(at + head.length, end));
  }
  return blocks;
}

/** Body of the first rule whose selector (list) is exactly `selector`, at top level or inside `@media <media>`. */
function rule(selector: string, media?: string): string {
  for (const scope of scopes(media)) {
    for (let from = 0; ; ) {
      const at = scope.indexOf(`${selector} {`, from);
      if (at < 0) break;
      const before = scope[at - 1];
      if (at === 0 || before === '\n' || before === ' ' || before === '}') {
        return scope.slice(scope.indexOf('{', at) + 1, scope.indexOf('}', at));
      }
      from = at + 1;
    }
  }
  return '';
}

describe('keyboard focus on a file picker (V1)', () => {
  it('shows the focus ring on the label when its hidden file input has focus', () => {
    const r = rule('label.button:has(input:focus-visible)');
    expect(r).toMatch(/outline:\s*3px solid var\(--focus\)/);
    expect(r).toMatch(/outline-offset:\s*2px/);
  });
});

describe('Get Engsub and Manage Vietsub rows (E1, E2)', () => {
  it('sets the destructive button apart from the others', () => {
    expect(rule('.history__actions .button--danger')).toMatch(/margin-left:\s*var\(--space-4\)/);
  });

  it('on phones lines the buttons up under the title instead of in a row of their own', () => {
    const r = rule('.history__actions', '(max-width: 760px)');
    expect(r).toMatch(/margin-left:\s*calc\(var\(--history-thumb\)/);
    expect(r).toMatch(/justify-content:\s*flex-start/);
    expect(r).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the thumbnail is smaller on narrow phones and the buttons follow it', () => {
    expect(rule('.history__item', '(max-width: 520px)')).toMatch(/--history-thumb:\s*96px/);
    expect(rule('.history__open img', '(max-width: 520px)')).toMatch(/width:\s*96px/);
  });
});

describe('Cue preview on phones (E4)', () => {
  it('is capped at 60% of the viewport height', () => {
    expect(rule('.cues', '(max-width: 760px)')).toMatch(/max-height:\s*60dvh/);
  });
});

describe('Placeholder in the dark URL frame (E5)', () => {
  it('is at least 55% white', () => {
    expect(rule('.frame__input::placeholder')).toMatch(/rgb\(255 255 255 \/ 0\.55\)/);
  });
});

describe('Vietsub list (L1, P3)', () => {
  it('limits the search box to 560px', () => {
    expect(rule('.page > .searchbar')).toMatch(/max-width:\s*560px/);
  });

  it('lines the playlist preview up with the playlist name', () => {
    const r = rule('.plcard__preview');
    expect(r).toMatch(/padding-left:\s*0/);
    expect(r).toMatch(/list-style:\s*none/);
  });

  it('on narrow phones a playlist card is a full-width cover with no preview and count + Play all on one row', () => {
    expect(rule('.plcards .plcard', '(max-width: 520px)')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.plcards .plcard__preview', '(max-width: 520px)')).toMatch(/display:\s*none/);
    expect(rule('.plcards .plcard__foot', '(max-width: 520px)')).toMatch(/justify-content:\s*space-between/);
  });

  it('colours the watched tick with the brand ink, never red', () => {
    expect(rule('.meta--watched')).toMatch(/color:\s*var\(--brand-ink\)/);
  });
});
