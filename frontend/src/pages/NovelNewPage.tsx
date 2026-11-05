import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { createNovel } from '../api/novels';
import { NovelForm } from '../components/novel/NovelForm';

/** Novels › New novel. */
export default function NovelNewPage() {
  const navigate = useNavigate();
  return (
    <main className="page">
      <Link className="back-link" to="/novels">
        <ArrowLeft className="icon" aria-hidden="true" />
        Novels
      </Link>
      <header className="masthead">
        <h1 className="masthead__name">New novel</h1>
      </header>
      <NovelForm
        submitLabel="Create novel"
        pendingLabel="Creating…"
        onSubmit={async (input) => {
          const created = await createNovel(input);
          navigate(`/novels/${created.id}`);
        }}
      />
    </main>
  );
}
