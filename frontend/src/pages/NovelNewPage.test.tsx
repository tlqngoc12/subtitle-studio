import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch, problem } from '../test/fakeFetch';
import { optionNames, pickOption } from '../test/select';
import { novelDetail } from '../test/novelFixtures';
import { slugify } from '../components/novel/NovelForm';
import NovelNewPage from './NovelNewPage';

function NovelStub() {
  const { id } = useParams();
  const { search } = useLocation();
  return (
    <p>
      novel {id}
      {search}
    </p>
  );
}

function renderPage(path = '/novels/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
    await pickOption(user, await screen.findByLabelText('Translation profile'), 'SummerLove');
    await pickOption(user, screen.getByLabelText('Status'), 'Completed');
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

  it('sends no profile when None is picked again after a profile (the empty value round-trips)', async () => {
    const calls = fakeFetch([profiles, { method: 'POST', path: '/api/novels', status: 201, body: novelDetail() }]);
    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'Tình Yêu Mùa Hạ');
    const select = await screen.findByLabelText('Translation profile');
    await pickOption(user, select, 'SummerLove');
    expect(select).toHaveTextContent('SummerLove');
    await pickOption(user, select, 'None (Translate is off)');
    expect(select).toHaveTextContent('None (Translate is off)');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    await screen.findByText('novel 3');
    const sent = JSON.parse(calls.find((c) => c.method === 'POST')!.body as string);
    expect(sent.promptProfile).toBeNull();
  });

  it('offers no profile when none exist', async () => {
    fakeFetch([{ ...profiles, body: { configured: false, profiles: [] } }]);
    renderPage();

    const select = await screen.findByLabelText('Translation profile');
    expect(select).toHaveTextContent('None (Translate is off)');
    expect(await optionNames(userEvent.setup(), select)).toEqual(['None (Translate is off)']);
  });

  describe('from Wattpad', () => {
    const STORY = 'https://www.wattpad.com/story/396487502-the-way-she-warmed-me';
    const preview = {
      storyId: '396487502',
      title: 'The Way She Warmed Me',
      author: 'emibonnie',
      description: 'Emi never expected the cold winter to end like this.',
      tags: ['gl', 'fluff'],
      completed: true,
      languageName: 'English',
      sourceLanguage: 'en',
      partCount: 28,
      coverUrl: 'https://img.wattpad.com/cover/396487502-256-k1.jpg',
      storyUrl: 'https://www.wattpad.com/story/396487502',
      existingNovelId: null,
    };
    const previewRoute = { method: 'POST', path: '/api/novels/wattpad/preview', status: 200, body: preview };

    it('keeps the Screenshots form by default and switches to a Fetch field', async () => {
      fakeFetch([profiles]);
      renderPage();
      const user = userEvent.setup();

      expect(screen.getByRole('button', { name: 'Screenshots' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByLabelText('Source language')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));

      expect(screen.getByLabelText('Wattpad story link')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('fetches the story and prefills the novel form', async () => {
      const calls = fakeFetch([profiles, previewRoute]);
      renderPage();
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));
      await user.type(screen.getByLabelText('Wattpad story link'), STORY);
      await user.click(screen.getByRole('button', { name: 'Fetch' }));

      expect(await screen.findByLabelText('Title')).toHaveValue('The Way She Warmed Me');
      expect(JSON.parse(calls.find((c) => c.path === '/api/novels/wattpad/preview')!.body as string)).toEqual({ url: STORY });
      expect(screen.getByLabelText('Slug')).toHaveValue('the-way-she-warmed-me');
      expect(screen.getByLabelText('Original author (optional)')).toHaveValue('emibonnie');
      expect(screen.getByLabelText('Description (optional)')).toHaveValue(preview.description);
      expect(screen.getByLabelText('Tags (optional)')).toHaveValue('gl, fluff');
      expect(screen.getByLabelText('Status')).toHaveTextContent('Completed');
      expect(screen.getByLabelText('Original book link (optional)')).toHaveValue('https://www.wattpad.com/story/396487502');
      expect(screen.getByLabelText('Source language')).toHaveTextContent('English');
      expect(screen.getByRole('img', { name: 'Cover from Wattpad' })).toHaveAttribute('src', preview.coverUrl);
    });

    it('creates a WATTPAD novel with the story id, language and cover, then opens its Wattpad tab', async () => {
      const calls = fakeFetch([
        profiles,
        previewRoute,
        { method: 'POST', path: '/api/novels', status: 201, body: novelDetail({ sourceType: 'WATTPAD' }) },
      ]);
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));
      await user.type(screen.getByLabelText('Wattpad story link'), STORY);
      await user.click(screen.getByRole('button', { name: 'Fetch' }));
      await screen.findByLabelText('Title');

      await pickOption(user, screen.getByLabelText('Source language'), 'Thai');
      await user.click(screen.getByRole('button', { name: 'Create novel' }));

      expect(await screen.findByText(/novel 3\?tab=wattpad/)).toBeInTheDocument();
      expect(JSON.parse(calls.find((c) => c.method === 'POST' && c.path === '/api/novels')!.body as string)).toMatchObject({
        sourceType: 'WATTPAD',
        sourceLanguage: 'th',
        wattpadStoryId: '396487502',
        coverUrl: preview.coverUrl,
        title: 'The Way She Warmed Me',
        originalAuthor: 'emibonnie',
        sourceUrl: 'https://www.wattpad.com/story/396487502',
        novelStatus: 'COMPLETED',
        tags: ['gl', 'fluff'],
      });
    });

    it('offers Open instead of Save when a novel already uses the story', async () => {
      fakeFetch([profiles, { ...previewRoute, body: { ...preview, existingNovelId: 41 } }]);
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));
      await user.type(screen.getByLabelText('Wattpad story link'), STORY);
      await user.click(screen.getByRole('button', { name: 'Fetch' }));

      expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute('href', '/novels/41');
      expect(screen.queryByRole('button', { name: 'Create novel' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('shows the Wattpad error under the field and keeps the link', async () => {
      fakeFetch([
        profiles,
        { ...previewRoute, status: 400, body: problem(400, 'INVALID_FANFIC_LINK', 'Use the story link (wattpad.com/story/…), not a chapter link.') },
      ]);
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));
      await user.type(screen.getByLabelText('Wattpad story link'), 'https://www.wattpad.com/123-chapter');
      await user.click(screen.getByRole('button', { name: 'Fetch' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('not a chapter link');
      expect(screen.getByLabelText('Wattpad story link')).toHaveValue('https://www.wattpad.com/123-chapter');
      expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled();
    });

    it('?wattpad=<link> opens on From Wattpad and fetches at once', async () => {
      const calls = fakeFetch([profiles, previewRoute]);
      renderPage(`/novels/new?wattpad=${encodeURIComponent(STORY)}`);

      expect(await screen.findByLabelText('Title')).toHaveValue('The Way She Warmed Me');
      expect(screen.getByRole('button', { name: 'From Wattpad' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Wattpad story link')).toHaveValue(STORY);
      expect(calls.filter((c) => c.path === '/api/novels/wattpad/preview')).toHaveLength(1);
    });

    it('a duplicate on Create shows the server message', async () => {
      fakeFetch([
        profiles,
        previewRoute,
        { method: 'POST', path: '/api/novels', status: 409, body: { ...problem(409, 'NOVEL_WATTPAD_EXISTS', 'This Wattpad story is already translated as “X”.'), novelId: 5 } },
      ]);
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'From Wattpad' }));
      await user.type(screen.getByLabelText('Wattpad story link'), STORY);
      await user.click(screen.getByRole('button', { name: 'Fetch' }));
      await screen.findByLabelText('Title');
      await user.click(screen.getByRole('button', { name: 'Create novel' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('already translated');
    });

    it('does not send Wattpad fields from the Screenshots form', async () => {
      const calls = fakeFetch([profiles, { method: 'POST', path: '/api/novels', status: 201, body: novelDetail() }]);
      renderPage();
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Title'), 'X');
      await user.click(screen.getByRole('button', { name: 'Create novel' }));

      await screen.findByText(/novel 3/);
      const sent = JSON.parse(calls.find((c) => c.method === 'POST')!.body as string);
      expect(sent).not.toHaveProperty('sourceType');
      expect(sent).not.toHaveProperty('wattpadStoryId');
      expect(sent).not.toHaveProperty('sourceLanguage');
    });
  });
});
