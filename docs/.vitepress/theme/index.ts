import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import RoadmapProgress from './RoadmapProgress.vue';
import MarkComplete from './MarkComplete.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'doc-after': () => h(MarkComplete) }),
  enhanceApp({ app }) {
    app.component('RoadmapProgress', RoadmapProgress);
  },
} satisfies Theme;
