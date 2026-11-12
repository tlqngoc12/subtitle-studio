import { MotionConfig } from 'motion/react';
import { Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { BackToTop } from './components/BackToTop';
import { NavBar } from './components/NavBar';
import { SkipLink } from './components/SkipLink';
import { ScrollToTop } from './components/ScrollToTop';
import { TopbarSlotProvider } from './components/TopbarSlot';
import ChapterPage from './pages/ChapterPage';
import HomePage from './pages/HomePage';
import NovelNewPage from './pages/NovelNewPage';
import NovelPage from './pages/NovelPage';
import NovelsPage from './pages/NovelsPage';
import PlaylistEditPage from './pages/PlaylistEditPage';
import PlaylistsPage from './pages/PlaylistsPage';
import PhotosPage from './pages/PhotosPage';
import WorkDetailPage from './pages/WorkDetailPage';
import WorkEditPage from './pages/WorkEditPage';
import WorksPage from './pages/WorksPage';
import ProfilePage, { ProfileRedirect } from './pages/ProfilePage';
import ProfilesPage from './pages/ProfilesPage';
import VietsubEditPage from './pages/VietsubEditPage';
import VietsubListPage from './pages/VietsubListPage';
import VietsubPage from './pages/VietsubPage';
import WatchPage from './pages/WatchPage';

export default function App() {
  return (
    // Every animation in the app follows the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <TopbarSlotProvider>
        <ScrollToTop />
        <SkipLink />
        <NavBar />
        <AppToaster />
        <BackToTop hideOn={[/^\/novels\/[^/]+\/chapters\/[^/]+$/]} />
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
        </Routes>
      </TopbarSlotProvider>
    </MotionConfig>
  );
}
