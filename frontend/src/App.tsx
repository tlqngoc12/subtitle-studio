import { Route, Routes } from 'react-router';
import { NavBar } from './components/NavBar';
import HomePage from './pages/HomePage';
import VietsubPage from './pages/VietsubPage';

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/vietsub" element={<VietsubPage />} />
      </Routes>
    </>
  );
}
