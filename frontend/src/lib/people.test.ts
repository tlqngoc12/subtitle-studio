import { describe, expect, it } from 'vitest';
import { matchesPerson } from './people';

const GROUP = 'emibonnie';

describe('matchesPerson', () => {
  it.each([
    // [item slugs, selected, expected]
    [[], null, true],
    [['emi'], null, true],
    [['emi'], 'emi', true],
    [['bonnie'], 'emi', false],
    [[], 'emi', false],
    [['emibonnie'], 'emi', true], // a member also gets the group's items
    [['emibonnie'], 'bonnie', true],
    [['emibonnie', 'emi'], 'bonnie', true],
    [['emibonnie'], 'emibonnie', true],
    [['emi'], 'emibonnie', false], // the group shows only the group's items
    [['emi', 'bonnie'], 'emibonnie', false],
    [[], 'emibonnie', false],
  ])('%j with %s selected is %s', (slugs, selected, expected) => {
    expect(matchesPerson(slugs as string[], selected as string | null, GROUP)).toBe(expected);
  });

  it('matches exactly when the group is not known yet', () => {
    expect(matchesPerson(['emibonnie'], 'emi', null)).toBe(false);
    expect(matchesPerson(['emi'], 'emi', null)).toBe(true);
  });
});
