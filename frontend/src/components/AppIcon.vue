<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{name:string}>();
const paths:Record<string,string> = {
  '/':'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  '/datasets':'M4 4h16v16H4z M4 9h16 M4 14h16 M9 4v16',
  '/clean':'M14 3l7 7-9 10H3v-9z M10 7l7 7 M7 16l-2 2',
  '/analysis':'M4 20V4 M4 20h17 M8 15l4-5 4 3 4-7',
  '/studio':'M4 20h17 M6 16V9h3v7 M12 16V4h3v12 M18 16v-5h3v5',
  '/assistant':'M12 3l2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7z',
  '/reports':'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',
  '/tasks':'M9 5h11 M9 12h11 M9 19h11 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2',
};
const path=computed(()=>paths[props.name] || paths['/datasets']);
</script>
<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="path"/></svg></template>
<style scoped>svg{display:block;width:20px;height:20px;flex-shrink:0}</style>
