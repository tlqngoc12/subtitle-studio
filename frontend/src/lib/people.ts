/**
 * Person filter shared by Works and Photos. `itemSlugs` are the profiles an item is tagged with (a work has at most
 * one). Choosing a member also keeps the items tagged with the group (they feature everyone); choosing the group
 * keeps only the items tagged with the group itself. `selected === null` is "All". `groupSlug` is null until the
 * profile page has loaded, in which case only exact matches count.
 */
export function matchesPerson(itemSlugs: readonly string[], selected: string | null, groupSlug: string | null): boolean {
  if (selected === null) return true;
  if (itemSlugs.includes(selected)) return true;
  return groupSlug !== null && selected !== groupSlug && itemSlugs.includes(groupSlug);
}
