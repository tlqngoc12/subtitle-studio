import type { Profile, ProfilePage } from '../api/profiles';
import { createPerson, listPeople, type Person } from '../api/works';
import { normalizeForSearch } from './search';

/** The profiles a Badge stands for: the group is both members, a member is itself, anything else nobody. */
export function profilesForBadge(page: ProfilePage, slug: string): Profile[] {
  if (slug === page.group.slug) return page.members;
  return page.members.filter((m) => m.slug === slug);
}

/** The directory person with the profile's display name or full name (case and accents ignored). */
export function findPersonFor(people: Person[], profile: Profile): Person | undefined {
  const wanted = [profile.displayName, profile.fullName]
    .filter((n): n is string => !!n && n.trim() !== '')
    .map(normalizeForSearch);
  return people.find((p) => wanted.includes(normalizeForSearch(p.name)));
}

export interface BadgePeople {
  /** People to add as credits, in profile order (already credited ones are left out). */
  toAdd: Person[];
}

/**
 * The People a Badge brings in. Reads the directory fresh, finds each profile's person or creates one named after the
 * profile (its portrait becomes the avatar), and skips anyone already in `creditedIds`. Creating happens only for
 * people who will really be added, and a failure stops everything so the caller can leave the credits as they were.
 */
export async function peopleForBadge(page: ProfilePage, slug: string, creditedIds: number[]): Promise<BadgePeople> {
  const profiles = profilesForBadge(page, slug);
  if (profiles.length === 0) return { toAdd: [] };
  const directory = await listPeople();
  const toAdd: Person[] = [];
  for (const profile of profiles) {
    const found = findPersonFor(directory, profile);
    if (found) {
      if (!creditedIds.includes(found.id) && !toAdd.some((p) => p.id === found.id)) toAdd.push(found);
      continue;
    }
    toAdd.push(await createPerson({ name: profile.displayName.trim(), avatarMediaId: profile.portraitMediaId }));
  }
  return { toAdd };
}
