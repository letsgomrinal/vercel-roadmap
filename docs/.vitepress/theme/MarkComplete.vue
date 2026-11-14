<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, withBase } from 'vitepress';
import { done, initProgress, toggle } from './progress';

onMounted(initProgress);
const route = useRoute();
const id = computed(() => route.path.match(/\/modules\/(\d\d)-/)?.[1] ?? null);
</script>

<template>
  <div v-if="id" class="mc">
    <button :class="{ on: done[id] }" @click="toggle(id)">
      {{ done[id] ? '✓ Module ' + id + ' complete' : 'Mark module ' + id + ' complete' }}
    </button>
    <a :href="withBase('/roadmap')">Back to roadmap</a>
  </div>
</template>

<style scoped>
.mc {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;
  margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--vp-c-divider);
}
.mc button {
  font-weight: 600; padding: 0.55rem 1.1rem; border-radius: 8px;
  border: 1px solid var(--vp-c-brand-1); color: var(--vp-c-brand-1);
}
.mc button.on { background: var(--vp-c-brand-1); color: var(--vp-c-white); }
.mc a { font-size: 0.9rem; }
</style>
