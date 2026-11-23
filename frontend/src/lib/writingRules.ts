/**
 * Writing rules for original stories: the global file (`data/prompts/writing-rules.md`) merged with one story's profile.
 * Pure functions; the Check and both "Copy for AI" exports use `effectiveRules`.
 * Spec: docs/superpowers/specs/2026-11-23-writing-rules-design.md.
 */
import { parseCheckRules, parseRule, type CheckRule } from './checkRules';

export interface GlobalRules {
  principles: string[];
  phrases: CheckRule[];
  details: CheckRule[];
  /** Every other `## ` section, verbatim; exported as is. */
  extra: string;
}

export interface EffectiveRules {
  principles: string[];
  storyPrinciples: string[];
  phrases: CheckRule[];
  details: CheckRule[];
  /** Profile `## Kiểm tra` rules that name a replacement. */
  corrections: CheckRule[];
  /** What Check matches: remaining global phrases and details plus every profile rule. */
  checkRules: CheckRule[];
  repeatIgnores: string[];
  ignored: number;
  extra: string;
}

const PRINCIPLES = 'Nguyên tắc viết';
const PHRASES = 'Cụm cấm';
const DETAILS = 'Chi tiết cấm';
const STORY_PRINCIPLES = 'Nguyên tắc riêng';

const headingOf = (line: string): string | null => {
  const m = /^##\s+(.*?)\s*$/u.exec(line.trim());
  return m ? m[1].normalize('NFC').toLowerCase() : null;
};

/** Bullet texts (without "- ") of `## <heading>` up to the next `## `; null when absent. Lines starting with "(" are hints. */
export function readSection(md: string, heading: string): string[] | null {
  const lines = md.normalize('NFC').split(/\r?\n/);
  const want = heading.normalize('NFC').toLowerCase();
  const start = lines.findIndex((l) => headingOf(l) === want);
  if (start < 0) return null;
  const out: string[] = [];
  for (const raw of lines.slice(start + 1)) {
    if (raw.startsWith('## ')) break;
    const bullet = /^\s*[-*]\s+(.*)$/u.exec(raw);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (text === '' || text.startsWith('(')) continue;
    out.push(text);
  }
  return out;
}

function rulesOf(md: string, heading: string): CheckRule[] {
  const rules: CheckRule[] = [];
  for (const text of readSection(md, heading) ?? []) {
    const rule = parseRule(text);
    if (rule) rules.push(rule);
  }
  return rules;
}

function extraSections(md: string): string {
  const known = new Set([PRINCIPLES, PHRASES, DETAILS].map((h) => h.normalize('NFC').toLowerCase()));
  const blocks: string[][] = [];
  let keep = false;
  for (const line of md.normalize('NFC').split(/\r?\n/)) {
    const heading = headingOf(line);
    if (heading !== null) {
      keep = !known.has(heading);
      if (keep) blocks.push([]);
    }
    if (keep) blocks[blocks.length - 1].push(line);
  }
  return blocks.map((b) => b.join('\n').trim()).join('\n\n');
}

export function parseGlobalRules(md: string): GlobalRules {
  return {
    principles: readSection(md, PRINCIPLES) ?? [],
    phrases: rulesOf(md, PHRASES),
    details: rulesOf(md, DETAILS),
    extra: extraSections(md),
  };
}

const key = (s: string) => s.normalize('NFC').toLowerCase();

/** The rules of one story: global minus its opt-outs, plus its own. `profile` is null when the story has none. */
export function effectiveRules(global: GlobalRules, profile: string | null): EffectiveRules {
  const parsed = parseCheckRules(profile ?? '');
  const off = new Set(parsed.optOuts.map(key));
  const used = new Set<string>();
  const keep = (rules: CheckRule[]) =>
    rules.filter((r) => {
      const k = key(r.wrong);
      if (off.has(k)) {
        used.add(k);
        return false;
      }
      return true;
    });
  const phrases = keep(global.phrases);
  const details = keep(global.details);
  const unmatched = [...off].filter((k) => !used.has(k)).length;
  return {
    principles: global.principles,
    storyPrinciples: profile === null ? [] : (readSection(profile, STORY_PRINCIPLES) ?? []),
    phrases,
    details,
    corrections: parsed.rules.filter((r) => r.suggestions.length > 0),
    checkRules: [...phrases, ...details, ...parsed.rules],
    repeatIgnores: parsed.repeatIgnores,
    ignored: parsed.ignored + unmatched,
    extra: global.extra,
  };
}

const list = (rules: CheckRule[]) => `- ${rules.map((r) => `"${r.wrong}"`).join(', ')}`;
const bullets = (items: string[]) => items.map((p) => `- ${p}`);

/** The text to paste into an AI's instructions. `perStory` adds the story's own principles and corrections. */
export function exportForAi(rules: EffectiveRules, perStory: boolean): string {
  const out: string[] = ['QUY TẮC VĂN PHONG (bắt buộc)', ''];
  if (rules.principles.length > 0) out.push('Nguyên tắc viết:', ...bullets(rules.principles));
  if (perStory && rules.storyPrinciples.length > 0) {
    out.push('Nguyên tắc riêng của truyện này:', ...bullets(rules.storyPrinciples));
  }
  if (rules.phrases.length > 0) out.push('Tuyệt đối không dùng các cụm sau:', list(rules.phrases));
  if (rules.details.length > 0) out.push('Không dùng các chi tiết sau:', list(rules.details));
  if (perStory && rules.corrections.length > 0) {
    out.push('Sửa đúng:', ...rules.corrections.map((r) => `- Viết "${r.suggestions[0]}", không viết "${r.wrong}".`));
  }
  if (rules.extra.trim() !== '') out.push(rules.extra.trim());
  out.push('Không lặp một cụm từ quá 2 lần trong một chương; không mở đầu 3 câu liền nhau bằng cùng một cách.');
  return out.join('\n');
}
