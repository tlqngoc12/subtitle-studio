import { Link } from 'react-router';

/** Public site: any route it does not have. */
export default function NotFoundPage() {
  return (
    <main className="page">
      <header className="masthead">
        <h1 className="masthead__name">Page not found</h1>
        <p className="masthead__lede">
          <Link to="/vietsub/list">Back to Vietsub list</Link>
        </p>
      </header>
    </main>
  );
}
