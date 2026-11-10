import type { BannerImage, Profile, ProfileBlock, ProfileItem, ProfilePage } from '../api/profiles';

/** A block with every optional field empty; override what the test needs. */
export function block(overrides: Partial<ProfileBlock> & Pick<ProfileBlock, 'id' | 'type'>): ProfileBlock {
  return {
    title: null,
    body: null,
    mediaId: null,
    mediaUrl: null,
    caption: null,
    embedUrl: null,
    items: [],
    ...overrides,
  };
}

export function item(overrides: Partial<ProfileItem>): ProfileItem {
  return { label: null, value: null, mediaId: null, mediaUrl: null, ...overrides };
}

export function profile(
  slug: string,
  displayName: string,
  blocks: ProfileBlock[],
  banner: BannerImage[] = [],
  overrides: Partial<Profile> = {},
): Profile {
  return {
    slug,
    displayName,
    kind: slug === 'emibonnie' ? 'GROUP' : 'MEMBER',
    tagline: null,
    fullName: null,
    portraitMediaId: null,
    portraitUrl: null,
    updatedAt: '2026-11-03T10:00:00Z',
    blocks,
    banner,
    ...overrides,
  };
}

export function page(members: Profile[], group: Profile = profile('emibonnie', 'EmiBonnie', [])): ProfilePage {
  return { group, members };
}
