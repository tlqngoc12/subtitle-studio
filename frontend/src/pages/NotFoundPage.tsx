import { Link } from 'react-router';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { useSite } from '../data/SiteContext';
import { useT } from '../lib/i18n';

/** Any route the app does not have (admin and public). */
export default function NotFoundPage() {
  const t = useT();
  const { homePath } = useSite();
  return (
    <Page>
      <PageHeader
        title={t('Page not found', 'Không tìm thấy trang')}
        lede={<Link to={homePath}>{t('Go to Get Engsub', 'Về trang Vietsub')}</Link>}
      />
    </Page>
  );
}
