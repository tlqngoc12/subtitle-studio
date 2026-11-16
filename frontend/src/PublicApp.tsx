import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { BackToTop } from './components/BackToTop';
import { NavBar } from './components/NavBar';
import { RouteFallback } from './components/RouteFallback';
import { SkipLink } from './components/SkipLink';
import { ScrollToTop } from './components/ScrollToTop';
import { TopbarSlotProvider } from './components/TopbarSlot';
import { SiteFooter } from './components/SiteFooter';
import { SiteProvider, type Site } from './data/SiteContext';
import { createNovelSource, withChapterCache } from './data/novelSource';
import { createStaticSource } from './data/staticSource';

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PhotosPage = lazy(() => import('./pages/PhotosPage'));
const WorkDetailPage = lazy(() => import('./pages/WorkDetailPage'));
const WorksPage = lazy(() => import('./pages/WorksPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ProfileRedirect = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfileRedirect })));
const PublicNovelPage = lazy(() => import('./pages/public/PublicNovelPage'));
const PublicNovelsPage = lazy(() => import('./pages/public/PublicNovelsPage'));
const PublicShelfPage = lazy(() => import('./pages/public/PublicShelfPage'));
const ReaderPage = lazy(() => import('./pages/public/ReaderPage'));
const VietsubListPage = lazy(() => import('./pages/VietsubListPage'));
const WatchPage = lazy(() => import('./pages/WatchPage'));

/** The public, read-only site (built with `npm run build:public`, deployed by Publish): static JSON, no API. */
export default function PublicApp() {
  const site = useMemo<Site>(
    () => ({ source: createStaticSource(), readOnly: true, homePath: '/vietsub/list' }),
    [],
  );
  const novels = useMemo(() => withChapterCache(createNovelSource()), []);
  return (
    <SiteProvider value={site}>
      <MotionConfig reducedMotion="user">
        <TopbarSlotProvider>
          <ScrollToTop />
          <SkipLink />
          <NavBar />
          <AppToaster />
          <BackToTop hideOn={[/^\/novels\/[^/]+\/[^/]+$/]} liftOn={[/^\/novels\/(?!shelf$)[^/]+$/]} />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
              <Route path="/" element={<Navigate to="/vietsub/list" replace />} />
              <Route path="/vietsub/list" element={<VietsubListPage />} />
              <Route path="/vietsub/:id" element={<WatchPage />} />
              <Route path="/profiles" element={<ProfilePage />} />
              <Route path="/profiles/:slug" element={<ProfileRedirect />} />
              <Route path="/photos" element={<PhotosPage />} />
              <Route path="/works" element={<WorksPage />} />
              <Route path="/works/:id" element={<WorkDetailPage />} />
              <Route path="/novels" element={<PublicNovelsPage source={novels} />} />
              <Route path="/novels/all" element={<Navigate to="/novels" replace />} />
              <Route path="/novels/shelf" element={<PublicShelfPage source={novels} />} />
              <Route path="/novels/:slug" element={<PublicNovelPage source={novels} />} />
              <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={novels} />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <SiteFooter />
        </TopbarSlotProvider>
      </MotionConfig>
    </SiteProvider>
  );
}
