import { describe, expect, it } from 'vitest';
import { vsVideo } from '../test/playlistFixtures';
import { matchesSearch, normalizeForSearch } from './search';

describe('search', () => {
  it('ignores case and Vietnamese marks', () => {
    expect(matchesSearch(vsVideo('a', 'Khám phá Chợ Đêm Bangkok'), 'cho dem')).toBe(true);
    expect(normalizeForSearch('Chợ Đêm')).toBe('cho dem');
  });

  it('maps đ / Đ to d', () => {
    expect(matchesSearch(vsVideo('a', 'Ăn đêm'), 'DEM')).toBe(true);
  });

  it('matches the channel too', () => {
    expect(matchesSearch(vsVideo('a', 'Vlog', 'EmiBonnie Official'), 'emibonnie')).toBe(true);
    expect(matchesSearch(vsVideo('a', 'Vlog', 'EmiBonnie Official'), 'nope')).toBe(false);
  });

  it('matches a Thai substring as written', () => {
    expect(matchesSearch(vsVideo('a', 'ตะลุยกินแหลกตลาดนัด'), 'ตลาด')).toBe(true);
  });

  it('matches everything for an empty or blank query', () => {
    expect(matchesSearch(vsVideo('a', 'Anything'), '')).toBe(true);
    expect(matchesSearch(vsVideo('a', 'Anything'), '   ')).toBe(true);
  });

  it('copes with a missing channel', () => {
    expect(matchesSearch({ ...vsVideo('a', 'Title'), channel: null }, 'x')).toBe(false);
  });
});
