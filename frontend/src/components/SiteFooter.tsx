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
        <p>Vietsub bởi @byZenQN · Mọi video thuộc quyền sở hữu của người tạo ra chúng · Cập nhật {year}</p>
      )}
    </footer>
  );
}
