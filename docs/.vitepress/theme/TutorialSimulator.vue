<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useData, useRouter } from 'vitepress';
import { TUTORIAL_SECTION_ANCHORS } from '../../../packages/webui/src/demo/tutorial-sections';
import { tutorialForPage, tutorialSectionForEvent, tutorialUrl } from '../tutorials.mjs';

const { page, frontmatter, site } = useData();
const restarts = ref(0);
const iframe = ref(null);
const router = useRouter();
// Page data changes for a chapter navigation, not for a section hash. Keeping
// this component outside Content preserves an active lesson while reading.
const lesson = computed(() => tutorialForPage(page.value.relativePath, frontmatter.value.tutorial));
const source = computed(() =>
  lesson.value ? tutorialUrl(site.value.base, lesson.value.chapter, lesson.value.lang) : '',
);
const copy = computed(() =>
  lesson.value?.lang === 'en'
    ? {
        title: `${page.value.title} — interactive tutorial`,
        restart: 'Restart tutorial',
        larger: 'Full view ↗',
        largerLabel: 'Open larger view (new tab)',
      }
    : {
        title: `${page.value.title} — 交互教程`,
        restart: '重新开始',
        larger: '放大查看 ↗',
        largerLabel: '在新标签页中放大',
      },
);

function onSectionRequest(event) {
  if (!iframe.value) return;
  const anchor = tutorialSectionForEvent(
    event,
    window.location.origin,
    iframe.value.contentWindow,
    lesson.value,
    TUTORIAL_SECTION_ANCHORS,
  );
  if (!anchor || !document.getElementById(anchor)) return;
  void router.go(
    `${window.location.pathname}${window.location.search}#${encodeURIComponent(anchor)}`,
  );
}

onMounted(() => window.addEventListener('message', onSectionRequest));
onBeforeUnmount(() => window.removeEventListener('message', onSectionRequest));
</script>

<template>
  <section
    v-if="lesson"
    class="tutorial-simulator"
    :data-tutorial="lesson.chapter"
    :aria-label="page.title"
  >
    <div class="tutorial-simulator-toolbar">
      <h2>{{ page.title }}</h2>
      <div class="tutorial-simulator-actions">
        <button type="button" data-tutorial-restart @click="restarts += 1">
          {{ copy.restart }}
        </button>
        <a
          :href="source"
          :aria-label="copy.largerLabel"
          target="_blank"
          rel="noopener noreferrer"
          data-tutorial-larger
          >{{ copy.larger }}</a
        >
      </div>
    </div>
    <iframe
      ref="iframe"
      :key="`${source}:${restarts}`"
      :src="source"
      :title="copy.title"
      sandbox="allow-scripts allow-same-origin allow-downloads"
      referrerpolicy="no-referrer"
    ></iframe>
  </section>
</template>
