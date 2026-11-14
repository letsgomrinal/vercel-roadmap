<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { withBase } from 'vitepress';
import { modules } from '../modules';
import { done, initProgress, toggle, reset } from './progress';

onMounted(initProgress);

const all = modules.flatMap((g) => g.items.map((i) => i[0]));
const count = computed(() => all.filter((id) => done.value[id]).length);
const pct = computed(() => Math.round((count.value / all.length) * 100));
const next = computed(() => {
  for (const g of modules) for (const i of g.items) if (!done.value[i[0]]) return i;
  return null;
});
</script>

<template>
  <div class="rp">
    <div class="rp-head">
      <div>
        <div class="rp-count">{{ count }} / {{ all.length }} modules complete</div>
        <div class="rp-bar"><div class="rp-fill" :style="{ width: pct + '%' }" /></div>
      </div>
      <a v-if="next" class="rp-next" :href="withBase(next[2])">Continue: {{ next[0] }} · {{ next[1] }} →</a>
      <span v-else class="rp-next rp-done">All done 🎉</span>
    </div>

    <div v-for="g in modules" :key="g.phase" class="rp-phase">
      <h3>{{ g.phase }}</h3>
      <ul>
        <li v-for="[id, title, link] in g.items" :key="id" :class="{ checked: done[id] }">
          <label>
            <input type="checkbox" :checked="!!done[id]" @change="toggle(id)" />
            <span class="rp-num">{{ id }}</span>
          </label>
          <a :href="withBase(link)">{{ title }}</a>
        </li>
      </ul>
    </div>

    <button class="rp-reset" @click="reset">Reset progress</button>
    <p class="rp-note">Progress is saved in this browser only.</p>
  </div>
</template>

<style scoped>
.rp { margin-top: 1.5rem; }
.rp-head {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border: 1px solid var(--vp-c-divider); border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.rp-count { font-weight: 600; margin-bottom: 0.4rem; }
.rp-bar { width: 260px; max-width: 60vw; height: 8px; border-radius: 99px; background: var(--vp-c-default-soft); overflow: hidden; }
.rp-fill { height: 100%; background: var(--vp-c-brand-1); transition: width 0.3s; }
.rp-next {
  font-weight: 600; padding: 0.45rem 0.9rem; border-radius: 8px;
  background: var(--vp-c-brand-1); color: var(--vp-c-white) !important; text-decoration: none !important;
}
.rp-done { background: var(--vp-c-green-1, #10b981); }
.rp-phase h3 { margin-top: 1.5rem !important; }
.rp-phase ul { list-style: none; padding-left: 0 !important; }
.rp-phase li { display: flex; align-items: center; gap: 0.6rem; margin: 0.35rem 0 !important; }
.rp-phase label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.rp-phase input { width: 1.05rem; height: 1.05rem; accent-color: var(--vp-c-brand-1); cursor: pointer; }
.rp-num { font-family: var(--vp-font-family-mono); font-size: 0.85em; color: var(--vp-c-text-2); }
.rp-phase li.checked a { color: var(--vp-c-text-2); text-decoration: line-through; }
.rp-reset {
  margin-top: 1.5rem; font-size: 0.85rem; padding: 0.3rem 0.8rem; border-radius: 6px;
  border: 1px solid var(--vp-c-divider); color: var(--vp-c-text-2);
}
.rp-reset:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.rp-note { font-size: 0.8rem; color: var(--vp-c-text-3); }
</style>
