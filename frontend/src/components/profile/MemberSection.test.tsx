import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { block, item, profile } from '../../test/profileFixtures';
import { MemberSection } from './MemberSection';

const FACTS_1 = block({
  id: 1,
  type: 'FACTS',
  title: 'Personal Information',
  items: [item({ label: 'Birthday', value: '13/05/1999' }), item({ label: 'Height', value: '165' })],
});
const FACTS_2 = block({ id: 2, type: 'FACTS', title: 'Career', items: [item({ label: 'Debut', value: '2019' })] });
const CHIPS = block({ id: 3, type: 'CHIPS', title: 'Hobbies', items: [item({ label: 'Reading' }), item({ label: 'Travel' })] });
const LINKS = block({
  id: 4,
  type: 'LINKS',
  title: 'Social',
  items: [item({ label: 'Instagram', value: 'https://instagram.com/emi' }), item({ label: 'Blog', value: 'https://blog.example/emi' })],
});

const EMI = profile('emi', 'Emi', [FACTS_1, FACTS_2, CHIPS, LINKS], [], {
  fullName: 'Thasorn Klinnium',
  tagline: 'Mimi — Emi of EmiBonnie.',
  portraitUrl: '/media/p.webp',
});

describe('MemberSection', () => {
  it('shows name, full name, tagline and a portrait that opens the lightbox', async () => {
    render(<MemberSection profile={EMI} side="left" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Emi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Thasorn Klinnium' })).toBeInTheDocument();
    expect(screen.getByText('Mimi — Emi of EmiBonnie.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View larger: Emi' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the initial when there is no portrait', () => {
    render(<MemberSection profile={profile('emi', 'Emi', [])} side="right" />);

    expect(screen.queryByRole('button', { name: /View larger/ })).not.toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Emi' })).toHaveClass('member--right');
  });

  it('shows social links as icons named by their label and does not repeat them in the details', () => {
    render(<MemberSection profile={EMI} side="left" />);

    const instagram = screen.getByRole('link', { name: 'Instagram' });
    expect(instagram).toHaveAttribute('href', 'https://instagram.com/emi');
    expect(instagram).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Blog' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Social' })).not.toBeInTheDocument();
  });

  it('renders FACTS as label and value pairs, hiding only the first FACTS title', () => {
    render(<MemberSection profile={EMI} side="left" />);

    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Birthday', 'Height', 'Debut']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['13/05/1999', '165', '2019']);
    expect(screen.queryByRole('heading', { name: 'Personal Information' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Career' })).toBeInTheDocument();
  });

  it('renders CHIPS as list items under their title', () => {
    render(<MemberSection profile={EMI} side="left" />);

    expect(screen.getByRole('heading', { name: 'Hobbies' })).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Emi' });
    const chips = within(section).getAllByRole('listitem').map((li) => li.textContent);
    expect(chips).toEqual(expect.arrayContaining(['Reading', 'Travel']));
  });
});
