import { useEffect, useState } from 'react';

/** True from the width where the list and the editor sit side by side (Tailwind `md`). */
export function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const h = () => setWide(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return wide;
}
