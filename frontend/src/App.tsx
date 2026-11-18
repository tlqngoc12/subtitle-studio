import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { BackToTop } from './components/BackToTop';
import { NavBar } from './components/NavBar';
import { RouteFallback } from './components/RouteFallback';
import { SkipLink } from './components/SkipLink';
import { ScrollToTop } from './components/ScrollToTop';
import { TopbarSlotProvider } from './components/TopbarSlot';

const ChapterPage = lazy(() => import('./pages/ChapterPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const NovelNewPage = lazy(() => import('./pages/NovelNewPage'));
const NovelPage = lazy(() => import('./pages/NovelPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const NovelsPage = lazy(() => import('./pages/NovelsPage'));
const PlaylistEditPage = lazy(() => import('./pages/PlaylistEditPage'));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'));
const PhotosPage = lazy(() => import('./pages/PhotosPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WorkDetailPage = lazy(() => import('./pages/WorkDetailPage'));
const WorkEditPage = lazy(() => import('./pages/WorkEditPage'));
const WorksPage = lazy(() => import('./pages/WorksPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ProfileRedirect = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfileRedirect })));
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));
const VietsubEditPage = lazy(() => import('./pages/VietsubEditPage'));
const VietsubListPage = lazy(() => import('./pages/VietsubListPage'));
const VietsubPage = lazy(() => import('./pages/VietsubPage'));
const WatchPage = lazy(() => import('./pages/WatchPage'));

export default function App() {
  return (
    // Every animation in the app follows the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <TopbarSlotProvider>
        <ScrollToTop />
        <SkipLink />
        <NavBar />
        <AppToaster />
        <BackToTop
          // Form pages with a sticky FormActions bar (the chapter editor's bar is at the top, so it needs nothing).
          barOn={[/^\/works\/(new|\d+\/edit)$/, /^\/novels\/new$/, /^\/novels\/\d+$/, /^\/settings\/gemini$/]}
        />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/vietsub" element={<VietsubPage />} />
            <Route path="/vietsub/list" element={<VietsubListPage />} />
            <Route path="/vietsub/playlists" element={<PlaylistsPage />} />
            <Route path="/vietsub/playlists/:playlistId" element={<PlaylistEditPage />} />
            <Route path="/vietsub/profiles" element={<ProfilesPage />} />
            <Route path="/vietsub/:id/edit" element={<VietsubEditPage />} />
            <Route path="/vietsub/:id" element={<WatchPage />} />
            <Route path="/profiles" element={<ProfilePage />} />
            <Route path="/profiles/:slug" element={<ProfileRedirect />} />
            <Route path="/photos" element={<PhotosPage />} />
            <Route path="/works" element={<WorksPage />} />
            <Route path="/works/new" element={<WorkEditPage />} />
            <Route path="/works/:id/edit" element={<WorkEditPage />} />
            <Route path="/works/:id" element={<WorkDetailPage />} />
            <Route path="/novels" element={<NovelsPage />} />
            <Route path="/novels/new" element={<NovelNewPage />} />
            <Route path="/novels/:id" element={<NovelPage />} />
            <Route path="/novels/:id/chapters/:chapterId" element={<ChapterPage />} />
            <Route path="/settings" element={<Navigate to="/settings/gemini" replace />} />
            <Route path="/settings/gemini" element={<SettingsPage tab="gemini" />} />
            <Route path="/settings/backups" element={<SettingsPage tab="backups" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
      </TopbarSlotProvider>
    </MotionConfig>
  );
}
