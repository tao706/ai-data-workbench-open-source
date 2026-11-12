<script setup lang="ts">
import { computed, ref } from 'vue';
const props = defineProps<{ rows: Record<string, unknown>[]; fields: string[]; height?: number }>();
const scrollTop = ref(0); const rowHeight = 38; const height = computed(() => props.height || 400);
const start = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight) - 5));
const end = computed(() => Math.min(props.rows.length, start.value + Math.ceil(height.value / rowHeight) + 10));
const visible = computed(() => props.rows.slice(start.value, end.value));
</script>
<template><div class="table-wrap" :style="{height:height+'px',overflow:'auto'}" @scroll="scrollTop=($event.target as HTMLElement).scrollTop"><div :style="{height:props.rows.length*rowHeight+'px',position:'relative'}"><table class="data-table" :style="{position:'absolute',top:start*rowHeight+'px'}"><thead><tr><th v-for="field in fields" :key="field">{{ field }}</th></tr></thead><tbody><tr v-for="(row,i) in visible" :key="start+i"><td v-for="field in fields" :key="field" :style="{height:rowHeight+'px'}">{{ row[field] ?? '—' }}</td></tr></tbody></table></div></div></template>
