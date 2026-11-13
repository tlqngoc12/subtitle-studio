import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { createNovel, type WattpadNovelPreview } from '../api/novels';
import { NovelForm } from '../components/novel/NovelForm';
import { WattpadFetch } from '../components/novel/WattpadFetch';
import { Alert } from '../components/ui/Alert';
import { FilterPills } from '../components/ui/FilterPills';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';

type Source = 'screenshots' | 'wattpad';

/**
 * Novels › New novel: from page screenshots (the form alone) or from a Wattpad story (paste the link, Fetch, then the
 * same form prefilled). `?wattpad=<link>` opens on From Wattpad and fetches that story at once.
 */
export default function NovelNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wattpadLink = params.get('wattpad');
  const [source, setSource] = useState<Source>(wattpadLink ? 'wattpad' : 'screenshots');
  const [preview, setPreview] = useState<WattpadNovelPreview | null>(null);

  return (
    <Page width="narrow">
      <PageHeader breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'New novel' }]} title="New novel" />
      <FilterPills
        label="Source"
        options={[
          { value: 'screenshots' as Source, label: 'Screenshots' },
          { value: 'wattpad' as Source, label: 'From Wattpad' },
        ]}
        value={source}
        onChange={setSource}
      />
      {source === 'screenshots' ? (
        <NovelForm
          stickyActions
          submitLabel="Create novel"
          pendingLabel="Creating…"
          onSubmit={async (input) => {
            const created = await createNovel(input);
            navigate(`/novels/${created.id}`);
          }}
        />
      ) : (
        <>
          <WattpadFetch initialUrl={wattpadLink} onPreview={setPreview} />
          {preview?.existingNovelId != null && (
            <Alert title="This story is already translated as a novel.">
              <Link className="button button--s" to={`/novels/${preview.existingNovelId}`}>
                Open
              </Link>
            </Alert>
          )}
          {preview && preview.existingNovelId == null && (
            <NovelForm
              key={preview.storyId}
              wattpad={preview}
              stickyActions
          submitLabel="Create novel"
              pendingLabel="Creating…"
              onSubmit={async (input) => {
                const created = await createNovel(input);
                navigate(`/novels/${created.id}?tab=wattpad`);
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}
