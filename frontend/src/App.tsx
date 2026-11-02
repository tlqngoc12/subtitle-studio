import { Route, Routes } from 'react-router';
import { NavBar } from './components/NavBar';
import HomePage from './pages/HomePage';
import VietsubPage from './pages/VietsubPage';
import WatchPage from './pages/WatchPage';

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/vietsub" element={<VietsubPage />} />
        <Route path="/vietsub/:id" element={<WatchPage />} />
      </Routes>
    </>
  );
}
