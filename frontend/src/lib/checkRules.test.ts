import { describe, expect, it } from 'vitest';
import { addCheckRule, applySuggestion, findIssues, formatCheckRule, parseCheckRules, type CheckRule } from './checkRules';

const section = (...lines: string[]) => `# Hồ sơ\n\n## Nhân vật\n- Emi\n\n## Kiểm tra\n${lines.join('\n')}\n\n## Tóm tắt nội dung chính\n- "x" → "y"\n`;

const rule = (wrong: string, suggestions: string[] = [], reason: string | null = null): CheckRule => ({
  wrong,
  suggestions,
  reason,
});

describe('parseCheckRules', () => {
  it('arrows: → and -> both work', () => {
    const { rules } = parseCheckRules(section('- "mẹ cô" → "mẹ em"', '- "cô ấy" -> "em ấy"'));
    expect(rules).toEqual([rule('mẹ cô', ['mẹ em']), rule('cô ấy', ['em ấy'])]);
  });

  it('multiple suggestions', () => {
    const { rules } = parseCheckRules(section('- "cảm xúc trẻ con" → "cảm xúc bồng bột" | "cảm xúc nông nổi"'));
    expect(rules).toEqual([rule('cảm xúc trẻ con', ['cảm xúc bồng bột', 'cảm xúc nông nổi'])]);
  });

  it('flag-only (tránh dùng)', () => {
    const { rules, ignored } = parseCheckRules(section('- "chàng" → (tránh dùng)', '- "nàng" →'));
    expect(rules).toEqual([rule('chàng'), rule('nàng')]);
    expect(ignored).toBe(0);
  });

  it('reason', () => {
    const { rules } = parseCheckRules(
      section('- "mẹ cô" → "mẹ em" (Bonnie dùng "em")'.replace('"em")', 'em)'), '- "chàng" → (tránh dùng) (giọng quá cổ)', '- "x" → (chỉ là lý do)'),
    );
    expect(rules).toEqual([
      rule('mẹ cô', ['mẹ em'], 'Bonnie dùng em'),
      rule('chàng', [], 'giọng quá cổ'),
      rule('x', [], 'chỉ là lý do'),
    ]);
  });

  it('curly quotes', () => {
    const { rules } = parseCheckRules(section('- “mẹ cô” → “mẹ em” | “mẹ anh” (lý do)'));
    expect(rules).toEqual([rule('mẹ cô', ['mẹ em', 'mẹ anh'], 'lý do')]);
  });

  it('hint line not counted', () => {
    const { rules, ignored } = parseCheckRules(
      section('- (Thêm dòng dạng "cụm sai" → "gợi ý" | "gợi ý khác" (lý do). Nút Check ở trang chương dùng các dòng này.)'),
    );
    expect(rules).toEqual([]);
    expect(ignored).toBe(0);
  });

  it('bad line counted', () => {
    const { rules, ignored } = parseCheckRules(
      section('- "ok" → "tốt"', '- mẹ cô thành mẹ em', '- "thiếu mũi tên" "mẹ em"', '- "dư" → "a" lung tung', '', 'một đoạn văn không phải gạch đầu dòng'),
    );
    expect(rules).toEqual([rule('ok', ['tốt'])]);
    expect(ignored).toBe(3);
  });

  it('section bounds: only the section is read, and no section means no rules', () => {
    const profile = '## Xưng hô\n- "sai" → "đúng"\n\n## Kiểm tra\n- "a" → "b"\n## Văn phong\n- "c" → "d"\n';
    expect(parseCheckRules(profile).rules).toEqual([rule('a', ['b'])]);
    expect(parseCheckRules('## Xưng hô\n- "sai" → "đúng"\n')).toEqual({ rules: [], ignored: 0 });
    // The last section runs to the end of the file, and Windows line endings are fine.
    expect(parseCheckRules('## Kiểm tra\r\n- "a" → "b"\r\n').rules).toEqual([rule('a', ['b'])]);
  });
});

describe('findIssues', () => {
  const spans = (text: string, rules: CheckRule[]) => findIssues(text, rules).map((i) => text.slice(i.start, i.end));

  it('word boundaries: "cô" is not inside cố, côn or Cô-ca, and is next to punctuation and quotes', () => {
    const rules = [rule('cô')];
    expect(spans('cố gắng, côn đồ, Cô-ca, xcô, cô1', rules)).toEqual([]);
    expect(spans('Cô ấy nói: “cô”, cô, (cô) cô.', rules)).toEqual(['Cô', 'cô', 'cô', 'cô', 'cô']);
    expect(findIssues('“cô”', rules)[0]).toMatchObject({ start: 1, end: 3 });
  });

  it('case-insensitive', () => {
    expect(spans('MẸ CÔ và Mẹ Cô và mẹ cô', [rule('mẹ cô')])).toEqual(['MẸ CÔ', 'Mẹ Cô', 'mẹ cô']);
  });

  it('NFC: decomposed text matches a composed rule and offsets point into the original text', () => {
    const decomposed = 'mệ cô a'; // "mệ cô a" with combining marks
    const issues = findIssues(decomposed, [rule('cô')]);
    expect(issues).toHaveLength(1);
    expect(decomposed.slice(issues[0].start, issues[0].end)).toBe('cô');
    // A decomposed rule matches composed text too.
    expect(spans('mẹ cô', [rule('cô')])).toEqual(['cô']);
  });

  it('overlap: the longer rule wins, then the earlier one', () => {
    const text = 'Thấy mẹ cô đang đứng';
    expect(spans(text, [rule('cô'), rule('mẹ cô')])).toEqual(['mẹ cô']);
    expect(spans('ab b', [rule('ab'), rule('b')])).toEqual(['ab', 'b']);
    expect(spans('aa bb', [rule('aa bb'), rule('aa')])).toEqual(['aa bb']);
  });

  it('markers skipped: an [[image:N]] line is never matched', () => {
    const text = 'cô đứng\n[[image:12]]\ncô nói';
    expect(findIssues(text, [rule('cô'), rule('image'), rule('12')])).toHaveLength(2);
    expect(spans('[[image:3]]' + String.fromCharCode(10) + 'cô', [rule('image')])).toEqual([]);
  });

  it('findIssues re-run after apply gives correct offsets', () => {
    const rules = [rule('mẹ cô', ['mẹ em']), rule('cảm xúc trẻ con', ['bồng bột'])];
    const text = 'Mẹ cô cười. Rồi cảm xúc trẻ con tràn về, và mẹ cô khóc.';
    const first = findIssues(text, rules);
    expect(first.map((i) => [i.start, i.end])).toEqual([[0, 5], [16, 31], [44, 49]]);

    // Apply the first: the others shift by the length difference, and a fresh run finds them where they now are.
    const after = applySuggestion(text, first[0], 'mẹ em');
    expect(after.startsWith('Mẹ em cười.')).toBe(true);
    const second = findIssues(after, rules);
    expect(second.map((i) => after.slice(i.start, i.end))).toEqual(['cảm xúc trẻ con', 'mẹ cô']);

    // Apply the last one first (so earlier offsets stay valid), then the middle one.
    const again = applySuggestion(after, second[1], 'mẹ em');
    const third = findIssues(again, rules);
    expect(third.map((i) => again.slice(i.start, i.end))).toEqual(['cảm xúc trẻ con']);
    expect(applySuggestion(again, third[0], 'bồng bột')).toBe('Mẹ em cười. Rồi bồng bột tràn về, và mẹ em khóc.');
  });

  it('returns nothing without rules or text', () => {
    expect(findIssues('', [rule('a')])).toEqual([]);
    expect(findIssues('abc', [])).toEqual([]);
  });
});

describe('applySuggestion', () => {
  it('applySuggestion keeps capital: "Mẹ cô" at the start of a sentence becomes "Mẹ em"', () => {
    const text = 'Mẹ cô cười, mẹ cô khóc.';
    const [first, second] = findIssues(text, [rule('mẹ cô', ['mẹ em'])]);
    expect(applySuggestion(text, first, 'mẹ em')).toBe('Mẹ em cười, mẹ cô khóc.');
    expect(applySuggestion(text, second, 'mẹ em')).toBe('Mẹ cô cười, mẹ em khóc.');
  });

  it('does not change a suggestion when the hit is lower case, and handles an empty suggestion', () => {
    const text = 'và mẹ cô nói';
    const [issue] = findIssues(text, [rule('mẹ cô')]);
    expect(applySuggestion(text, issue, 'Mẹ Em')).toBe('và Mẹ Em nói');
    expect(applySuggestion(text, issue, '')).toBe('và  nói');
  });
});

describe('formatCheckRule', () => {
  it('formats suggestions and reason', () => {
    expect(formatCheckRule(rule('cô ta', ['cô', 'em'], 'Emi là cô'))).toBe('- "cô ta" → "cô" | "em" (Emi là cô)');
  });

  it('formats flag-only', () => {
    expect(formatCheckRule(rule('ả'))).toBe('- "ả" → (tránh dùng)');
    expect(formatCheckRule(rule('ả', [], 'xúc phạm'))).toBe('- "ả" → (tránh dùng) (xúc phạm)');
  });

  it('formatted rule round-trips through parseCheckRules', () => {
    for (const r of [rule('mẹ cô', ['mẹ em']), rule('cô ta', ['cô', 'em'], 'lý do'), rule('ả'), rule('ả', [], 'lý do')]) {
      expect(parseCheckRules(section(formatCheckRule(r))).rules).toEqual([r]);
    }
  });

  it('formatted rule round-trips NFC', () => {
    const decomposed = 'mệ cô'; // "mệ cô" typed with combining marks
    const line = formatCheckRule(rule(decomposed, [decomposed]));
    expect(line).toBe(line.normalize('NFC'));
    const nfc = decomposed.normalize('NFC');
    expect(parseCheckRules(section(line)).rules).toEqual([rule(nfc, [nfc])]);
  });
});

describe('addCheckRule', () => {
  it('addCheckRule appends inside section', () => {
    const out = addCheckRule(section('- "a" → "b"', '- "c" → "d"'), rule('e', ['f']));
    expect(out).toBe(section('- "a" → "b"', '- "c" → "d"', '- "e" → "f"'));
  });

  it('addCheckRule creates section before Tóm tắt', () => {
    const profile = '# Hồ sơ\n\n## Nhân vật\n- Emi\n\n## Tóm tắt nội dung chính\n- x\n';
    expect(addCheckRule(profile, rule('e', ['f']))).toBe(
      '# Hồ sơ\n\n## Nhân vật\n- Emi\n\n## Kiểm tra\n- "e" → "f"\n\n## Tóm tắt nội dung chính\n- x\n',
    );
  });

  it('addCheckRule creates section at end', () => {
    expect(addCheckRule('# Hồ sơ\n\n## Nhân vật\n- Emi\n', rule('e', ['f']))).toBe(
      '# Hồ sơ\n\n## Nhân vật\n- Emi\n\n## Kiểm tra\n- "e" → "f"\n',
    );
    expect(addCheckRule('', rule('e', ['f']))).toBe('## Kiểm tra\n- "e" → "f"\n');
  });

  it('addCheckRule replaces same wrong phrase case-insensitively', () => {
    const out = addCheckRule(section('- "Mẹ cô" → "mẹ em"', '- "c" → "d"'), rule('mẹ CÔ', ['mẹ tôi'], 'x'));
    expect(out).toBe(section('- "mẹ CÔ" → "mẹ tôi" (x)', '- "c" → "d"'));
  });

  it('addCheckRule keeps later sections', () => {
    const profile = '## Nhân vật\n- Emi\n\n## Kiểm tra\n- "a" → "b"\n\n## Tóm tắt nội dung chính\n- x\n\n## Khác\n- y\n';
    expect(addCheckRule(profile, rule('e', ['f']))).toBe(
      '## Nhân vật\n- Emi\n\n## Kiểm tra\n- "a" → "b"\n- "e" → "f"\n\n## Tóm tắt nội dung chính\n- x\n\n## Khác\n- y\n',
    );
  });

  it('addCheckRule works when the section is last and has no trailing newline', () => {
    expect(addCheckRule('## A\n- x\n\n## Kiểm tra\n- "a" → "b"', rule('e', ['f']))).toBe('## A\n- x\n\n## Kiểm tra\n- "a" → "b"\n- "e" → "f"');
  });

  it('addCheckRule keeps CRLF files CRLF', () => {
    const out = addCheckRule('## A\r\n- x\r\n\r\n## Kiểm tra\r\n- "a" → "b"\r\n', rule('e', ['f']));
    expect(out).toBe('## A\r\n- x\r\n\r\n## Kiểm tra\r\n- "a" → "b"\r\n- "e" → "f"\r\n');
  });
});
