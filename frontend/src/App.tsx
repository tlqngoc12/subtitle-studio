import { MotionConfig } from 'motion/react';
import { Navigate, Route, Routes } from 'react-router';
import { AppToaster } from './components/AppToaster';
import { NavBar } from './components/NavBar';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import VietsubListPage from './pages/VietsubListPage';
import VietsubPage from './pages/VietsubPage';
import WatchPage from './pages/WatchPage';

export default function App() {
  return (
    // Every animation in the app follows the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <NavBar />
      <AppToaster />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/vietsub" element={<VietsubPage />} />
        <Route path="/vietsub/list" element={<VietsubListPage />} />
        <Route path="/vietsub/:id" element={<WatchPage />} />
        <Route path="/profiles" element={<Navigate to="/profiles/emibonnie" replace />} />
        <Route path="/profiles/:slug" element={<ProfilePage />} />
      </Routes>
    </MotionConfig>
  );
}
