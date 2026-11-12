export interface YearGroup<T> {
  /** `null` for undated items ("Coming Soon"). */
  year: number | null;
  label: string;
  items: T[];
}

/** Groups items by release year: undated first, then years descending; the order inside a group is kept. */
export function groupByYear<T>(items: T[], dateOf: (item: T) => string | null): YearGroup<T>[] {
  const byYear = new Map<number | null, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    const year = date ? Number(date.slice(0, 4)) : null;
    const list = byYear.get(year);
    if (list) list.push(item);
    else byYear.set(year, [item]);
  }
  const years = [...byYear.keys()].filter((y): y is number => y !== null).sort((a, b) => b - a);
  const order: (number | null)[] = byYear.has(null) ? [null, ...years] : years;
  return order.map((year) => ({ year, label: year === null ? 'Coming Soon' : String(year), items: byYear.get(year)! }));
}
