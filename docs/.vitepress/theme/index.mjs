import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import TutorialSimulator from './TutorialSimulator.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // Keep the simulator outside the narrow prose and outline columns.
      'doc-top': () => h(TutorialSimulator),
    }),
};
