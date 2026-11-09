import { UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getPublishStatus, startPublish, type PublishStatus } from '../api/publish';
import { errorMessage } from '../lib/errors';
import { Tip } from './Tip';
import { useConfirmDialog } from './useConfirmDialog';
import './PublishButton.css';

const NOT_CONFIGURED_TIP = 'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT in .env';

function tipFor(state: PublishStatus | null): string {
  if (!state) return 'Publish the public site';
  if (!state.configured) return NOT_CONFIGURED_TIP;
  if (state.status === 'PUBLISHING') return 'Publishing…';
  if (!state.lastPublishedAt) return 'Not published yet';
  const when = new Date(state.lastPublishedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return `Last published ${when}`;
}

/**
 * Admin top bar: publishes the read-only site. Asks first, then polls the status every `pollMs` until the publish
 * ends and reports it with a toast ("Published" + Open site, or the error).
 */
export function PublishButton({ pollMs = 2000 }: { pollMs?: number }) {
  const [state, setState] = useState<PublishStatus | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const publishing = state?.status === 'PUBLISHING';

  useEffect(() => {
    getPublishStatus()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    if (!publishing) return;
    const timer = setTimeout(() => {
      getPublishStatus()
        .then((next) => {
          setState(next);
          if (next.status === 'DONE') {
            toast.success('Published', {
              description: next.url ? (
                <a href={next.url} target="_blank" rel="noopener noreferrer">
                  Open site
                </a>
              ) : undefined,
            });
          } else if (next.status === 'FAILED') {
            toast.error(next.error ?? 'Publishing failed.');
          }
        })
        .catch(() => {
          // try again on the next tick
          setState((s) => (s ? { ...s } : s));
        });
    }, pollMs);
    return () => clearTimeout(timer);
  }, [publishing, state, pollMs]);

  async function publish() {
    if (!(await confirm({ title: 'Publish the public site now?', confirmLabel: 'Publish' }))) return;
    try {
      setState(await startPublish());
      toast('Publishing…');
    } catch (e) {
      toast.error(errorMessage(e).title);
    }
  }

  return (
    <>
      <Tip label={tipFor(state)}>
        <span className="publish">
          <button
            type="button"
            className={publishing ? 'button button--small button--spinning' : 'button button--small'}
            disabled={!state?.configured || publishing}
            aria-busy={publishing}
            onClick={() => void publish()}
          >
            <UploadCloud className="icon" aria-hidden="true" />
            {/* Visually hidden on phones (icon only); the name stays for screen readers. */}
            <span className="publish__label">Publish</span>
          </button>
        </span>
      </Tip>
      {dialog}
    </>
  );
}
