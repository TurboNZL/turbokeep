import { useEffect, useState } from 'react';

/** True from the width where the list and the editor sit side by side (Tailwind `md`, 768 px; or from another width). */
export function useWide(minPx = 768) {
  const q = `(min-width: ${minPx}px)`;
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const h = () => setWide(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return wide;
}
