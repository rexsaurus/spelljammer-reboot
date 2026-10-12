import { defineConfig } from 'vite';
// Decoded assets are served from ../extracted (git-ignored), produced by tools/sj_decode.py
// from your own copy of the game. No game data lives in this repo.
export default defineConfig({ publicDir: '../extracted', server: { open: true }, build: { target: 'esnext', rollupOptions: { input: { viewer: 'index.html', game: 'game.html' } } } });
