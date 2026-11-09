import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch, problem } from '../test/fakeFetch';
import { novelDetail } from '../test/novelFixtures';
import { slugify } from '../components/novel/NovelForm';
import NovelNewPage from './NovelNewPage';

function NovelStub() {
  const { id } = useParams();
  return <p>novel {id}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novels/new']}>
      <Routes>
        <Route path="/novels/new" element={<NovelNewPage />} />
        <Route path="/novels/:id" element={<NovelStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const profiles = { method: 'GET', path: '/api/novel-profiles', status: 200, body: { configured: true, profiles: ['SummerLove'] } };

describe('NovelNewPage', () => {
  it('turns a Vietnamese title into a slug', () => {
    expect(slugify('Tình Yêu Mùa Hạ')).toBe('tinh-yeu-mua-ha');
    expect(slugify('  Đường về -- nhà!! ')).toBe('duong-ve-nha');
  });

  it('suggests the slug from the title until the slug is edited', async () => {
    fakeFetch([profiles]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'Tình Yêu');
    expect(screen.getByLabelText('Slug')).toHaveValue('tinh-yeu');

    await user.clear(screen.getByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'my-slug');
    await user.type(screen.getByLabelText('Title'), ' Mùa Hạ');
    expect(screen.getByLabelText('Slug')).toHaveValue('my-slug');
  });

  it('creates the novel and opens it', async () => {
    const calls = fakeFetch([profiles, { method: 'POST', path: '/api/novels', status: 201, body: novelDetail() }]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'Tình Yêu Mùa Hạ');
    await user.type(screen.getByLabelText('Original author (optional)'), 'ผู้เขียน');
    await user.type(screen.getByLabelText('Tags (optional)'), 'romance, BL');
    await user.selectOptions(await screen.findByLabelText('Translation profile'), 'SummerLove');
    await user.selectOptions(screen.getByLabelText('Status'), 'COMPLETED');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    expect(await screen.findByText('novel 3')).toBeInTheDocument();
    const sent = JSON.parse(calls.find((c) => c.method === 'POST')!.body as string);
    expect(sent).toMatchObject({
      slug: 'tinh-yeu-mua-ha',
      title: 'Tình Yêu Mùa Hạ',
      originalAuthor: 'ผู้เขียน',
      tags: ['romance', 'BL'],
      novelStatus: 'COMPLETED',
      promptProfile: 'SummerLove',
      coverMediaId: null,
      sourceUrl: null,
      trailerUrl: null,
    });
  });

  it('sends the pasted trailer link as typed (trimmed); the server extracts the video id', async () => {
    const calls = fakeFetch([profiles, { method: 'POST', path: '/api/novels', status: 201, body: novelDetail() }]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'X');
    await user.type(screen.getByLabelText('Trailer (YouTube link)'), '  https://www.youtube.com/watch?v=dQw4w9WgXcQ ');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    await screen.findByText('novel 3');
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body as string).trailerUrl).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('shows a trailer error next to the Trailer field', async () => {
    fakeFetch([
      profiles,
      {
        method: 'POST',
        path: '/api/novels',
        status: 400,
        body: {
          ...problem(400, 'INVALID_NOVEL', 'Invalid novel'),
          errors: [{ field: 'trailerUrl', message: 'Use a YouTube link (youtube.com or youtu.be).' }],
        },
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'X');
    await user.type(screen.getByLabelText('Trailer (YouTube link)'), 'https://vimeo.com/1');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    const trailer = screen.getByLabelText('Trailer (YouTube link)');
    await waitFor(() => expect(trailer).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(trailer.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Use a YouTube link (youtube.com or youtu.be).',
    );
  });

  it('shows a field error next to its input', async () => {
    fakeFetch([
      profiles,
      {
        method: 'POST',
        path: '/api/novels',
        status: 400,
        body: {
          ...problem(400, 'INVALID_NOVEL', 'Invalid novel'),
          errors: [{ field: 'slug', message: 'Use lowercase letters, numbers and single hyphens.' }],
        },
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    const slug = screen.getByLabelText('Slug');
    await waitFor(() => expect(slug).toHaveAttribute('aria-invalid', 'true'));
    const describedBy = slug.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent(
      'Use lowercase letters, numbers and single hyphens.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields.');
  });

  it('offers no profile when none exist', async () => {
    fakeFetch([{ ...profiles, body: { configured: false, profiles: [] } }]);
    renderPage();

    const select = await screen.findByLabelText('Translation profile');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'None (Translate is off)' })).toBeInTheDocument();
  });
});
