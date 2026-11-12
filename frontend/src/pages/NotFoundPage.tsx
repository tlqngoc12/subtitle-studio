import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
import { useT } from '../lib/i18n';

/** Public site: any route it does not have. */
export default function NotFoundPage() {
  const t = useT();
  return (
    <main className="page">
      <PageHeader
        title={t('Page not found', 'Không tìm thấy trang')}
        lede={<Link to="/vietsub/list">{t('Back to Vietsub list', 'Quay lại danh sách Vietsub')}</Link>}
      />
    </main>
  );
}
