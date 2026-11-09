import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';

/** Public site: any route it does not have. */
export default function NotFoundPage() {
  return (
    <main className="page">
      <PageHeader title="Page not found" lede={<Link to="/vietsub/list">Back to Vietsub list</Link>} />
    </main>
  );
}
