import { screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * A list region after its data has arrived. The region renders right away with "Loading list…",
 * so querying its items straight after findByRole races the fetch (it fails on slow machines, e.g. in Docker).
 */
export async function loadedRegion(name: string): Promise<HTMLElement> {
  const region = await screen.findByRole('region', { name });
  await waitFor(() => expect(within(region).queryByText('Loading list…')).not.toBeInTheDocument());
  return region;
}
