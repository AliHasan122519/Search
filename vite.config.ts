import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' keeps the build portable (static hosting, Artifact, Capacitor in phase 2).
export default defineConfig({ base: './', plugins: [react()], build: { assetsInlineLimit: 0, target: 'es2022' } });
