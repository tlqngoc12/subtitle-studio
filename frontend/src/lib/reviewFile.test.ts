import { describe, expect, it } from 'vitest';
import { findReviewIssues, parseReview, type ReviewRow } from './reviewFile';

const TABLE = `## Sửa

| Mục | Dòng | Đoạn cũ | Đoạn mới |
|---|---|---|---|
| 🔴1 | 12 | Emi cúi xuống. | Emi ghé lại gần. |
| 🟡2 | 30 | Bonnie thở dài. | Bonnie khẽ thở ra. |

| Chương | Số chữ |
|---|---|
| 1 | 3000 |
`;

const row = (old: string, replacement: string, item = '🔴1'): ReviewRow => ({ item, old, replacement });

describe('parseReview', () => {
  it('parses the review table', () => {
    const rows = parseReview(TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ item: '🔴1', old: 'Emi cúi xuống.', replacement: 'Emi ghé lại gần.' });
  });

  it('decodes cells', () => {
    const md = [
      '| Mục | Đoạn cũ | Đoạn mới |',
      '|---|---|---|',
      '| 1 | a \\| b | x<br>y |',
      '| 2 | one | (xoá) |',
      '| 3 | two | (xóa) |',
      '| 4 | three |  |',
      '| 5 | four | z<br/>w<br />v |',
    ].join('\n');
    const rows = parseReview(md);
    expect(rows[0]).toMatchObject({ old: 'a | b', replacement: 'x\ny' });
    expect(rows[1].replacement).toBe('');
    expect(rows[2].replacement).toBe('');
    expect(rows[3].replacement).toBe('');
    expect(rows[4].replacement).toBe('z\nw\nv');
  });

  it('reads several tables', () => {
    const md = [
      '| Mục | Dòng | Đoạn cũ | Đoạn mới |',
      '|---|---|---|---|',
      '| 🔴1 | 1 | a | b |',
      '',
      'text between',
      '',
      '| Đoạn mới | Đoạn cũ | Mục |',
      '|---|---|---|',
      '| d | c | 🟡2 |',
    ].join('\n');
    expect(parseReview(md)).toEqual([
      { item: '🔴1', old: 'a', replacement: 'b' },
      { item: '🟡2', old: 'c', replacement: 'd' },
    ]);
  });

  it('skips rows with an empty old text and tables missing a column', () => {
    const md = ['| Mục | Đoạn cũ |', '|---|---|', '| 1 | a |', '', '| Mục | Đoạn cũ | Đoạn mới |', '|---|---|---|', '| 2 |  | b |'].join('\n');
    expect(parseReview(md)).toEqual([]);
  });
});

describe('findReviewIssues', () => {
  it('matches across quote styles and whitespace', () => {
    const text = 'Cô nói: “Đi  đi.” Rồi đi.';
    const scan = findReviewIssues(text, [row('Cô nói: "Đi đi."', 'Cô bảo: "Đi."')]);
    expect(scan.issues).toHaveLength(1);
    expect(text.slice(scan.issues[0].start, scan.issues[0].end)).toBe('Cô nói: “Đi  đi.”');
    expect(scan.issues[0].rule).toEqual({ wrong: 'Cô nói: "Đi đi."', suggestions: ['Cô bảo: "Đi."'], reason: '🔴1' });
  });

  it('is case-sensitive', () => {
    const r = row('emi cúi xuống.', 'Zzz');
    const scan = findReviewIssues('Emi cúi xuống.', [r]);
    expect(scan.issues).toHaveLength(0);
    expect(scan.notFound).toEqual([r]);
  });

  it('marks every occurrence', () => {
    const scan = findReviewIssues('Ừ. Rồi. Ừ. Rồi.', [row('Rồi.', 'Xong.')]);
    expect(scan.issues.map((i) => i.start)).toEqual([3, 11]);
  });

  it('escapes regex characters', () => {
    const text = 'Cô hỏi: Sao vậy? (cười) Ừ.*';
    const scan = findReviewIssues(text, [row('Sao vậy? (cười)', 'Gì thế?'), row('Ừ.*', 'Ừ.')]);
    expect(scan.issues).toHaveLength(2);
  });

  it('drops overlapping hits', () => {
    const scan = findReviewIssues('Bonnie cúi xuống nhìn', [row('Bonnie cúi xuống', 'A', '🔴1'), row('cúi xuống nhìn', 'B', '🔴2')]);
    expect(scan.issues).toHaveLength(1);
    expect(scan.issues[0].rule.reason).toBe('🔴1');
  });

  it('counts done and not found', () => {
    const present = row('cũ một', 'mới một', '🔴1');
    const removal = row('cũ hai', '', '🔴2');
    const neither = row('cũ ba', 'mới ba', '🔴3');
    const scan = findReviewIssues('Có mới một ở đây.', [present, removal, neither]);
    expect(scan.issues).toHaveLength(0);
    expect(scan.done).toEqual([present, removal]);
    expect(scan.notFound).toEqual([neither]);
  });

  it('is not done while the old text is still there', () => {
    const scan = findReviewIssues('cũ một và mới một', [row('cũ một', 'mới một')]);
    expect(scan.issues).toHaveLength(1);
    expect(scan.done).toHaveLength(0);
  });
});
