import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublishStatus } from '../api/publish';
import { answerConfirm } from '../test/confirm';
import { expectTooltip } from '../test/tooltip';
import { AppToaster } from './AppToaster';
import { PublishButton } from './PublishButton';

const URL_ = 'https://fans.pages.dev';
const idle: PublishStatus = { status: 'IDLE', configured: true, lastPublishedAt: null, url: URL_, error: null };

/** GET /api/publish answers the statuses in turn (the last one repeats); POST answers `started`. */
function serve(statuses: PublishStatus[], started: PublishStatus | { status: number; body: unknown }) {
  const posts: string[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (String(input) !== '/api/publish') throw new TypeError('Failed to fetch');
      if (method === 'POST') {
        posts.push('POST');
        if ('body' in started) {
          return new Response(JSON.stringify(started.body), { status: started.status, headers: { 'Content-Type': 'application/problem+json' } });
        }
        return new Response(JSON.stringify(started), { status: 202, headers: { 'Content-Type': 'application/json' } });
      }
      const body = statuses[Math.min(i++, statuses.length - 1)];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return posts;
}

function renderButton() {
  return render(
    <>
      <PublishButton pollMs={10} />
      <AppToaster />
    </>,
  );
}

describe('PublishButton', () => {
  it('disabledWhenNotConfigured', async () => {
    serve([{ ...idle, configured: false, url: null }], idle);
    renderButton();

    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeDisabled());
    await expectTooltip(
      button.parentElement!,
      'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT in .env',
    );
  });

  it('confirmsThenPublishes', async () => {
    const posts = serve([idle, { ...idle, status: 'PUBLISHING' }], { ...idle, status: 'PUBLISHING' });
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.setup().click(button);
    await answerConfirm('Publish', 'Publish the public site now?');

    expect(posts).toEqual(['POST']);
    expect(await screen.findByText('Publishing started')).toBeInTheDocument();
  });

  it('spinsAndPollsUntilDone', async () => {
    const done = { ...idle, status: 'DONE' as const, lastPublishedAt: '2026-11-04T10:00:30Z' };
    serve([idle, { ...idle, status: 'PUBLISHING' }, done], { ...idle, status: 'PUBLISHING' });
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.setup().click(button);
    await answerConfirm('Publish');

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Site published')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open site' })).toHaveAttribute('href', URL_);
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('showsErrorWhenFailed', async () => {
    const failed = { ...idle, status: 'FAILED' as const, error: 'Cloudflare rejected the API token.' };
    serve([idle, failed], { ...idle, status: 'PUBLISHING' });
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.setup().click(button);
    await answerConfirm('Publish');

    // Short title, the server's text as the description.
    expect(await screen.findByText('Publishing failed')).toBeInTheDocument();
    expect(await screen.findByText('Cloudflare rejected the API token.')).toBeInTheDocument();
  });

  it('showsAnErrorWhenStartingFails', async () => {
    serve([idle], { status: 409, body: { status: 409, code: 'PUBLISH_IN_PROGRESS', detail: 'x' } });
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.setup().click(button);
    await answerConfirm('Publish');

    expect(await screen.findByText('A publish is already running')).toBeInTheDocument();
  });

  it('tooltipShowsLastPublish', async () => {
    serve([{ ...idle, status: 'DONE', lastPublishedAt: '2026-11-04T10:00:30Z' }], idle);
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await expectTooltip(button.parentElement!, 'Last published');
  });

  it('tooltipSaysNotPublishedYet', async () => {
    serve([idle], idle);
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    await expectTooltip(button.parentElement!, 'Not published yet');
  });

  it('warns at 16000 files', async () => {
    serve([{ ...idle, fileCount: 16000 }], idle);
    renderButton();

    expect(
      await screen.findByText(
        'Site đang có 16.000/20.000 file (giới hạn Cloudflare Free). Sắp đầy, nên tính chuyển ảnh chương sang R2.',
      ),
    ).toBeInTheDocument();
  });

  it('no warning at 15999', async () => {
    serve([{ ...idle, fileCount: 15999 }], idle);
    renderButton();
    const button = await screen.findByRole('button', { name: 'Publish' });
    await waitFor(() => expect(button).toBeEnabled());

    expect(screen.queryByText(/Sắp đầy/)).not.toBeInTheDocument();
  });
});
