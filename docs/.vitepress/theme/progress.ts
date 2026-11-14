import { ref } from 'vue';

const KEY = 'vercel-roadmap-progress-v1';

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export const done = ref<Record<string, boolean>>({});
let loaded = false;

export function initProgress() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  done.value = load();
}

export function toggle(id: string) {
  done.value = { ...done.value, [id]: !done.value[id] };
  try {
    localStorage.setItem(KEY, JSON.stringify(done.value));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

export function reset() {
  done.value = {};
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
