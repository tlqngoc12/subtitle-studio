import { describe, expect, it } from 'vitest';
import { effectiveRules, exportForAi, parseGlobalRules, readSection } from './writingRules';
import { WRITING_RULES_SEED } from './writingRulesSeed';

const PHRASES = [
  'cúi đầu',
  'ngẩng đầu',
  'tim đập thình thịch',
  'ánh mắt sâu thẳm',
  'im lặng đến đáng sợ',
  'không trả lời ngay',
  'im lặng không nói',
  'không đáp ngay',
];
const DETAILS = ['đeo đồng hồ', 'tháo đồng hồ', 'mùi dầu gội', 'mùi nước hoa'];

describe('readSection', () => {
  it('returns bullets, skips hint lines, null when absent', () => {
    const md = '## A\n- one\n- (hint)\n- two\n\n## B\n- three\n';
    expect(readSection(md, 'A')).toEqual(['one', 'two']);
    expect(readSection(md, 'C')).toBeNull();
  });
});

describe('parseGlobalRules', () => {
  it('reads the seed', () => {
    const g = parseGlobalRules(WRITING_RULES_SEED);
    expect(g.principles.length).toBe(5);
    expect(g.phrases.map((r) => r.wrong)).toEqual(PHRASES);
    expect(g.details.map((r) => r.wrong)).toEqual(DETAILS);
    expect(g.extra).toBe('');
  });

  it('keeps unknown sections as extra', () => {
    const g = parseGlobalRules('## Cụm cấm\n- "a"\n\n## Ghi chú\n- hello\n');
    expect(g.extra).toBe('## Ghi chú\n- hello');
  });
});

describe('effectiveRules', () => {
  const global = parseGlobalRules(WRITING_RULES_SEED);

  it('opt-out removes a global rule', () => {
    const e = effectiveRules(global, '## Kiểm tra\n- bỏ luật chung: "tháo đồng hồ"\n');
    expect(e.checkRules.map((r) => r.wrong)).not.toContain('tháo đồng hồ');
    expect(e.details.length).toBe(3);
    expect(e.ignored).toBe(0);
  });

  it('an opt-out matching nothing counts as ignored', () => {
    expect(effectiveRules(global, '## Kiểm tra\n- bỏ luật chung: "không có"\n').ignored).toBe(1);
  });

  it('corrections need a suggestion; flag-only profile rules only check', () => {
    const e = effectiveRules(global, '## Kiểm tra\n- "mẹ cô" → "mẹ em"\n- "xyz"\n');
    expect(e.corrections.map((r) => r.wrong)).toEqual(['mẹ cô']);
    expect(e.checkRules.map((r) => r.wrong)).toEqual(expect.arrayContaining(['mẹ cô', 'xyz']));
  });

  it('works without a profile', () => {
    const e = effectiveRules(global, null);
    expect(e.checkRules.length).toBe(12);
    expect(e.repeatIgnores).toEqual([]);
  });
});

describe('exportForAi', () => {
  const global = parseGlobalRules(WRITING_RULES_SEED);
  const profile = '## Nguyên tắc riêng\n- Emi dùng "cô"\n\n## Kiểm tra\n- "mẹ cô" → "mẹ em"\n';

  it('per story export', () => {
    const text = exportForAi(effectiveRules(global, profile), true);
    expect(text.startsWith('QUY TẮC VĂN PHONG (bắt buộc)\n\nNguyên tắc viết:\n- ')).toBe(true);
    expect(text).toContain('Nguyên tắc riêng của truyện này:\n- Emi dùng "cô"');
    expect(text).toContain('- "cúi đầu", "ngẩng đầu",');
    expect(text).toContain('Sửa đúng:\n- Viết "mẹ em", không viết "mẹ cô".');
    expect(text.endsWith('Không lặp một cụm từ quá 2 lần trong một chương; không mở đầu 3 câu liền nhau bằng cùng một cách.')).toBe(true);
  });

  it('global export has no per-story parts', () => {
    const text = exportForAi(effectiveRules(global, profile), false);
    expect(text).not.toContain('Nguyên tắc riêng');
    expect(text).not.toContain('Sửa đúng');
  });
});
