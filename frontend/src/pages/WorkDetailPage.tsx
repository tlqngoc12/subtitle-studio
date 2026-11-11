import { ArrowLeft, Clapperboard, Pencil } from 'lucide-react';
import { Reveal } from '../components/ui/Reveal';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import type { Work } from '../api/works';
import { CATEGORY_LABELS, peopleHeading } from '../components/works/categories';
import { LinkButtons } from '../components/works/LinkButtons';
import { PeopleCards } from '../components/works/PeopleCards';
import { Alert } from '../components/ui/Alert';
import { ImageLightbox } from '../components/ui/ImageLightbox';
import { LoadingText } from '../components/ui/LoadingText';
import { PageHeader } from '../components/ui/PageHeader';
import { useSite } from '../data/SiteContext';
import { formatDay } from '../lib/dates';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import './WorkDetailPage.css';

/** A work's page (/works/:id). An id that is not a positive whole number, or an unknown work, is "Work not found". */
export default function WorkDetailPage() {
  const { id: raw = '' } = useParams();
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
  const { source, readOnly } = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  const [work, setWork] = useState<Work | null>(null);
  const [notFound, setNotFound] = useState(id === null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (id === null) return;
    let current = true;
    setWork(null);
    setNotFound(false);
    setError(null);
    source
      .getWork(id)
      .then((w) => current && setWork(w))
      .catch((e) => {
        if (!current) return;
        if (e instanceof ApiError && e.code === 'WORK_NOT_FOUND') setNotFound(true);
        else setError(errorMessage(e, { readOnly }));
      });
    return () => {
      current = false;
    };
  }, [id, source, readOnly]);

  // Back keeps the filters when the visitor came from the grid; a shared link goes to the grid.
  const cameFromGrid = (location.state as { fromWorks?: boolean } | null)?.fromWorks === true;
  const back = (
    <Link
      className="back-link"
      to="/works"
      onClick={(e) => {
        if (cameFromGrid) {
          e.preventDefault();
          navigate(-1);
        }
      }}
    >
      <ArrowLeft className="icon" aria-hidden="true" />
      Back to Works
    </Link>
  );

  if (notFound) {
    return (
      <main className="page">
        <PageHeader title="Work not found" lede={back} />
      </main>
    );
  }

  return (
    <main className="page">
      {back}
      {error && <Alert title={error.title} hint={error.hint} />}
      {work === null && !error && <LoadingText>Loading work…</LoadingText>}

      {work && (
        <article className="work">
          <div className="work__cover-col">
            {work.coverUrl ? (
              <>
                <button type="button" className="work__cover" aria-label={`View larger: ${work.title}`} onClick={() => setZoom(true)}>
                  <img src={work.coverUrl} alt={work.title} />
                </button>
                <ImageLightbox
                  images={[{ src: work.coverUrl, alt: work.title }]}
                  index={zoom ? 0 : null}
                  onIndexChange={() => undefined}
                  onClose={() => setZoom(false)}
                />
              </>
            ) : (
              <div className="work__cover work__cover--empty" aria-hidden="true">
                <Clapperboard className="icon" />
              </div>
            )}
          </div>

          <div className="work__body">
            <div className="work__chips">
              {work.categories.map((c) => (
                <span key={c} className="work__chip work__chip--category">
                  {CATEGORY_LABELS[c]}
                </span>
              ))}
              {work.subcategory && <span className="work__chip">{work.subcategory}</span>}
            </div>
            <h1 className="work__title">{work.title}</h1>
            <p className="work__date">{work.releaseDate ? formatDay(work.releaseDate) : 'Coming Soon'}</p>
            {!readOnly && (
              <div>
                <Link className="button button--s" to={`/works/${work.id}/edit`}>
                  <Pencil className="icon" aria-hidden="true" />
                  Edit
                </Link>
              </div>
            )}
            <LinkButtons links={work.links} />
            {work.description && <p className="work__description">{work.description}</p>}
          </div>

          {work.credits.length > 0 && (
            <Reveal as="section" className="work__people" aria-labelledby="work-people">
              <h2 id="work-people">{peopleHeading(work.categories)}</h2>
              <PeopleCards credits={work.credits} />
            </Reveal>
          )}
        </article>
      )}
    </main>
  );
}
