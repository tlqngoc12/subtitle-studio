import { MotionConfig } from 'motion/react';
import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { BackToTop } from './components/BackToTop';
import { NavBar } from './components/NavBar';
import { SkipLink } from './components/SkipLink';
import { ScrollToTop } from './components/ScrollToTop';
import { TopbarSlotProvider } from './components/TopbarSlot';
import { SiteFooter } from './components/SiteFooter';
import { SiteProvider, type Site } from './data/SiteContext';
import { createNovelSource, withChapterCache } from './data/novelSource';
import { createStaticSource } from './data/staticSource';
import NotFoundPage from './pages/NotFoundPage';
import PhotosPage from './pages/PhotosPage';
import WorkDetailPage from './pages/WorkDetailPage';
import WorksPage from './pages/WorksPage';
import ProfilePage, { ProfileRedirect } from './pages/ProfilePage';
import PublicAllNovelsPage from './pages/public/PublicAllNovelsPage';
import PublicNovelPage from './pages/public/PublicNovelPage';
import PublicNovelsPage from './pages/public/PublicNovelsPage';
import ReaderPage from './pages/public/ReaderPage';
import VietsubListPage from './pages/VietsubListPage';
import WatchPage from './pages/WatchPage';

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
          <BackToTop hideOn={[/^\/novels\/[^/]+\/[^/]+$/]} liftOn={[/^\/novels\/(?!all$)[^/]+$/]} />
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
            <Route path="/novels/all" element={<PublicAllNovelsPage source={novels} />} />
            <Route path="/novels/:slug" element={<PublicNovelPage source={novels} />} />
            <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={novels} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <SiteFooter />
        </TopbarSlotProvider>
      </MotionConfig>
    </SiteProvider>
  );
}
