import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Be Vietnam Pro: designed for Vietnamese, so stacked diacritics (ọ, ầ, ữ) render in the same face.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/700.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
