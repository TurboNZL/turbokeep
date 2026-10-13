import './fonts.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { applyAppearance, watchSystemTheme } from './lib/appearance.ts';
import { useStore } from './lib/store.ts';
import { App } from './App.tsx';

// the look is applied before the first paint, so a saved theme never flashes the default one
applyAppearance(useStore.getState().settings);
watchSystemTheme(() => useStore.getState().settings);

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
