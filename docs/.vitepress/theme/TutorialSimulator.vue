<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData, useRouter } from 'vitepress';
import { TUTORIAL_SECTION_ANCHORS } from '../../../packages/webui/src/demo/tutorial-sections';
import { tutorialForPage, tutorialSectionForEvent, tutorialUrl } from '../tutorials.mjs';

const { page, frontmatter, site } = useData();
const restarts = ref(0);
const viewport = ref(null);
const canvasStyle = ref(null);
const iframe = ref(null);
const loadButton = ref(null);
const collapseButton = ref(null);
const expanded = ref(false);
const loaded = ref(false);
const ready = ref(false);
const router = useRouter();
// Page data changes for a chapter navigation, not for a section hash. Keeping
// this component outside Content preserves an active lesson while reading.
const lesson = computed(() => tutorialForPage(page.value.relativePath, frontmatter.value.tutorial));
const source = computed(() =>
  lesson.value ? tutorialUrl(site.value.base, lesson.value.chapter, lesson.value.lang) : '',
);
const fullView = computed(() =>
  lesson.value
    ? tutorialUrl(site.value.base, lesson.value.chapter, lesson.value.lang, { embedded: false })
    : '',
);

// A chapter or language change starts closed. Hash-only navigation keeps progress.
watch(source, () => {
  expanded.value = false;
  loaded.value = false;
  restarts.value = 0;
});

// Fit the whole console without reloading the frame or resizing it during the
// reveal. Use its compact layout on phones rather than shrinking a desktop UI.
watch(viewport, (element, _, onCleanup) => {
  if (!element) return;
  let width = element.clientWidth;
  let previousWidth;
  let previousHeight;
  function fitCanvas() {
    const heightLimit = Math.max(360, window.innerHeight * 0.8);
    if (!width || (width === previousWidth && heightLimit === previousHeight)) return;
    previousWidth = width;
    previousHeight = heightLimit;
    const desktop = width >= 768;
    const frameWidth = desktop ? 1120 : Math.max(360, Math.floor(width));
    const frameHeight = desktop ? 720 : 640;
    const scale = Math.min(1, width / frameWidth, heightLimit / frameHeight);
    canvasStyle.value = {
      '--sim-frame-width': `${frameWidth}px`,
      '--sim-frame-height': `${frameHeight}px`,
      '--sim-scaled-width': `${frameWidth * scale}px`,
      '--sim-scaled-height': `${frameHeight * scale}px`,
      '--sim-scale': scale,
    };
  }
  fitCanvas();
  const observer = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    fitCanvas();
  });
  observer.observe(element);
  window.addEventListener('resize', fitCanvas);
  onCleanup(() => {
    observer.disconnect();
    window.removeEventListener('resize', fitCanvas);
  });
});

async function toggleSimulator() {
  expanded.value = !expanded.value;
  if (expanded.value) loaded.value = true;

  await nextTick();
  const destination = expanded.value ? collapseButton : loadButton;
  destination.value?.focus({ preventScroll: true });
  destination.value?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}

const copy = computed(() =>
  lesson.value?.lang === 'en'
    ? {
        title: `${page.value.title} — interactive tutorial`,
        load: 'Load simulator',
        expand: 'Resume simulator',
        collapse: 'Collapse simulator',
        description: 'Follow the chapter in a console with sample data.',
        retained: 'Resume from where you left off in this chapter.',
        restart: 'Restart tutorial',
        larger: 'Full page',
        largerLabel: 'Full page — open this lesson in a new tab',
      }
    : {
        title: `${page.value.title} — 交互教程`,
        load: '加载模拟器',
        expand: '继续练习',
        collapse: '收起模拟器',
        description: '使用示例数据，跟着本章操作控制台。',
        retained: '练习进度已保留，可以接着操作。',
        restart: '重新开始',
        larger: '全页练习',
        largerLabel: '全页练习：在新标签页打开本章模拟器',
      },
);

function onSectionRequest(event) {
  if (!expanded.value || !iframe.value) return;
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

onMounted(() => {
  window.addEventListener('message', onSectionRequest);
  ready.value = true;
});
onBeforeUnmount(() => window.removeEventListener('message', onSectionRequest));
</script>

<template>
  <section
    v-if="lesson"
    class="tutorial-simulator"
    :data-tutorial="lesson.chapter"
    :data-tutorial-expanded="expanded"
    :aria-label="copy.title"
  >
    <header class="tutorial-simulator-toolbar">
      <h2>{{ lesson.lang === 'en' ? 'Interactive tutorial' : '交互教程' }}</h2>
      <a
        class="tutorial-simulator-secondary"
        :href="fullView"
        :aria-label="copy.largerLabel"
        target="_blank"
        rel="noopener noreferrer"
        data-tutorial-larger
      >
        <span>{{ copy.larger }}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M13 5h6v6m0-6-8 8m7 0v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </a>
      <div v-if="expanded" class="tutorial-simulator-actions">
        <button
          class="tutorial-simulator-secondary"
          type="button"
          data-tutorial-restart
          @click="restarts += 1"
        >
          {{ copy.restart }}
        </button>
        <button
          ref="collapseButton"
          class="tutorial-simulator-secondary"
          type="button"
          data-tutorial-collapse
          aria-expanded="true"
          aria-controls="tutorial-simulator-stage"
          @click="toggleSimulator"
        >
          {{ copy.collapse }}
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="m7 14 5-5 5 5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
    <div ref="viewport" class="tutorial-simulator-viewport" :style="canvasStyle">
      <div
        id="tutorial-simulator-stage"
        class="tutorial-simulator-stage"
        :inert="!expanded"
        :aria-hidden="expanded ? undefined : 'true'"
      >
        <!-- Allow React submit handlers to run; the demo's CSP still blocks native form navigation. -->
        <iframe
          v-if="loaded"
          ref="iframe"
          :key="`${source}:${restarts}`"
          :src="source"
          :title="copy.title"
          :tabindex="expanded ? undefined : -1"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
      <div
        class="tutorial-simulator-glass"
        data-tutorial-glass
        :inert="expanded"
        :aria-hidden="expanded ? 'true' : undefined"
      >
        <div class="tutorial-simulator-launch">
          <p class="tutorial-simulator-description">
            {{ loaded ? copy.retained : copy.description }}
          </p>
          <button
            ref="loadButton"
            type="button"
            class="tutorial-simulator-toggle"
            data-tutorial-load
            :disabled="!ready"
            :aria-expanded="expanded"
            aria-controls="tutorial-simulator-stage"
            @click="toggleSimulator"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6.5v11l8-5.5-8-5.5Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ loaded ? copy.expand : copy.load }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
