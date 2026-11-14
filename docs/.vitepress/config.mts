import { defineConfig } from 'vitepress';
import { modules } from './modules';



export default defineConfig({
  title: 'Vercel Zero to Hero',
  description: 'A hands-on Vercel roadmap for AI platform engineers',
  base: '/vercel-roadmap/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/vercel-roadmap/favicon.svg' }]],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'Start', link: '/modules/01-mental-model' },
      { text: 'Cheat sheet', link: '/modules/12-cheat-sheet' },
    ],
    sidebar: [
      { text: 'Overview', items: [{ text: 'Roadmap & progress', link: '/roadmap' }] },
      ...modules.map((g) => ({
        text: g.phase,
        collapsed: false,
        items: g.items.map(([n, t, l]) => ({ text: `${n} · ${t}`, link: l })),
      })),
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/letsgomrinal/vercel-roadmap' }],
    editLink: {
      pattern: 'https://github.com/letsgomrinal/vercel-roadmap/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: { message: 'Researched against Vercel docs and changelog as of 14 Nov 2026. Beta features may change.' },
  },
});
