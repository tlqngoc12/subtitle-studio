import { useEffect, useState } from 'react';
import './SiteFooter.css';

/** Public site footer: credit and the year of the last publish (from data/site.json; this year if unavailable). */
export function SiteFooter() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    fetch('/data/site.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((site: { year?: number }) => current && setYear(site.year ?? new Date().getFullYear()))
      .catch(() => current && setYear(new Date().getFullYear()));
    return () => {
      current = false;
    };
  }, []);

  return (
    <footer className="site-footer">
      {year !== null && (
        <p>Vietsub by @byZenQN · All videos are the property of their original creators · Updated {year}</p>
      )}
    </footer>
  );
}
