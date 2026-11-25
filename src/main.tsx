import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

// the page owns its direction and language (it may be embedded in a host page that sets neither)
document.documentElement.dir = 'rtl'; document.documentElement.lang = 'ar';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
