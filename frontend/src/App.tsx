import { MotionConfig } from 'motion/react';
import { Navigate, Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { NavBar } from './components/NavBar';
import { TopbarSlotProvider } from './components/TopbarSlot';
import ChapterPage from './pages/ChapterPage';
import HomePage from './pages/HomePage';
import NovelNewPage from './pages/NovelNewPage';
import NovelPage from './pages/NovelPage';
import NovelsPage from './pages/NovelsPage';
import PlaylistEditPage from './pages/PlaylistEditPage';
import PlaylistsPage from './pages/PlaylistsPage';
import ProfilePage from './pages/ProfilePage';
import VietsubListPage from './pages/VietsubListPage';
import VietsubPage from './pages/VietsubPage';
import WatchPage from './pages/WatchPage';

export default function App() {
  return (
    // Every animation in the app follows the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <TopbarSlotProvider>
        <NavBar />
        <AppToaster />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vietsub" element={<VietsubPage />} />
          <Route path="/vietsub/list" element={<VietsubListPage />} />
          <Route path="/vietsub/playlists" element={<PlaylistsPage />} />
          <Route path="/vietsub/playlists/:playlistId" element={<PlaylistEditPage />} />
          <Route path="/vietsub/:id" element={<WatchPage />} />
          <Route path="/profiles" element={<Navigate to="/profiles/emibonnie" replace />} />
          <Route path="/profiles/:slug" element={<ProfilePage />} />
          <Route path="/novels" element={<NovelsPage />} />
          <Route path="/novels/new" element={<NovelNewPage />} />
          <Route path="/novels/:id" element={<NovelPage />} />
          <Route path="/novels/:id/chapters/:chapterId" element={<ChapterPage />} />
        </Routes>
      </TopbarSlotProvider>
    </MotionConfig>
  );
}
