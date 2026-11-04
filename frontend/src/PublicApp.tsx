import { MotionConfig } from 'motion/react';
import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { NavBar } from './components/NavBar';
import { SiteFooter } from './components/SiteFooter';
import { SiteProvider, type Site } from './data/SiteContext';
import { createStaticSource } from './data/staticSource';
import NotFoundPage from './pages/NotFoundPage';
import ProfilePage from './pages/ProfilePage';
import VietsubListPage from './pages/VietsubListPage';
import WatchPage from './pages/WatchPage';

/** The public, read-only site (built with `npm run build:public`, deployed by Publish): static JSON, no API. */
export default function PublicApp() {
  const site = useMemo<Site>(
    () => ({ source: createStaticSource(), readOnly: true, homePath: '/vietsub/list' }),
    [],
  );
  return (
    <SiteProvider value={site}>
      <MotionConfig reducedMotion="user">
        <NavBar />
        <Routes>
          <Route path="/" element={<Navigate to="/vietsub/list" replace />} />
          <Route path="/vietsub/list" element={<VietsubListPage />} />
          <Route path="/vietsub/:id" element={<WatchPage />} />
          <Route path="/profiles" element={<Navigate to="/profiles/emibonnie" replace />} />
          <Route path="/profiles/:slug" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <SiteFooter />
      </MotionConfig>
    </SiteProvider>
  );
}
