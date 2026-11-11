import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { WorkCategory } from '../../api/works';
import { fakeFetch } from '../../test/fakeFetch';
import { person } from '../../test/workFixtures';
import { CreditsEditor, type CreditRow } from './CreditsEditor';

function Harness({ category, initial = [] }: { category: WorkCategory | WorkCategory[]; initial?: CreditRow[] }) {
  const [rows, setRows] = useState<CreditRow[]>(initial);
  const key = useRef(100);
  return <CreditsEditor value={rows} categories={Array.isArray(category) ? category : [category]} onChange={setRows} errors={[]} newKey={() => key.current++} />;
}

const BONNIE: CreditRow = { key: 1, person: person(2, 'Bonnie'), role: 'Lead', characterName: 'Key' };

describe('CreditsEditor', () => {
  it('shows the character field for Film & TV', () => {
    render(<Harness category="FILM_TV" initial={[BONNIE]} />);

    expect(screen.getByLabelText('Character of Bonnie')).toHaveValue('Key');
    expect(screen.queryByText('Character names are removed for non-film works.')).not.toBeInTheDocument();
  });

  it('hides the character field for Music and warns when characters are filled', () => {
    render(<Harness category="MUSIC" initial={[BONNIE]} />);

    expect(screen.queryByLabelText('Character of Bonnie')).not.toBeInTheDocument();
    expect(screen.getByText('Character names are removed for non-film works.')).toBeInTheDocument();
  });

  it('shows no warning for Music when no character was typed', () => {
    render(<Harness category="MUSIC" initial={[{ ...BONNIE, characterName: '' }]} />);

    expect(screen.queryByText('Character names are removed for non-film works.')).not.toBeInTheDocument();
  });

  it('suggests roles for the category', () => {
    const { container } = render(<Harness category="MUSIC" initial={[BONNIE]} />);

    const options = Array.from(container.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'));
    expect(options).toEqual(['Singer', 'Featuring', 'Vocal', 'MV cast']);
  });

  it('picks a person from the directory and removes a row', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: [person(2, 'Bonnie'), person(3, 'Emi')] },
    ]);
    render(<Harness category="FILM_TV" initial={[BONNIE]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Person' }));
    expect(await screen.findByRole('button', { name: 'Emi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bonnie' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Emi' }));

    expect(screen.getByLabelText('Role of Emi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bonnie' }));
    expect(screen.queryByLabelText('Role of Bonnie')).not.toBeInTheDocument();
  });
});
