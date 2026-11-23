<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElDialog } from 'element-plus';
import type { Citation, Retrieval } from '../knowledge';
import { modeLabel } from '../knowledge';
const props = defineProps<{ retrieval: Retrieval; question: string }>();
const selected = ref<Citation>();
const open = ref(false);
function show(source: Citation) { selected.value = source; open.value = true; }
const parts = computed(() => {
  const text = selected.value?.text || '';
  const matches = props.question.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9_]{2,}/g) || [];
  const tokens = [...new Set(matches.flatMap(word => /^[\u4e00-\u9fff]+$/.test(word) ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word]))].filter(word => text.toLowerCase().includes(word.toLowerCase())).slice(0, 16);
  if (!tokens.length) return [{ text, highlight: false }];
  const expression = new RegExp(`(${tokens.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(expression).map(part => ({ text: part, highlight: tokens.some(word => word.toLowerCase() === part.toLowerCase()) }));
});
defineExpose({ show });
</script>
<template>
  <section class="source-evidence" aria-label="业务资料引用">
    <div class="source-heading"><strong>业务资料依据</strong><span class="badge">{{ modeLabel(retrieval.mode) }}</span></div>
    <p class="muted small">{{ retrieval.notice }}</p>
    <div v-if="retrieval.sources.length" class="source-list">
      <button v-for="source in retrieval.sources" :key="source.id" class="source-card" @click="show(source)">
        <span class="source-number">[{{ source.id }}]</span><span><strong>{{ source.name }}</strong><small>片段 {{ source.chunk }} · 查看引用原文</small></span><span aria-hidden="true">↗</span>
      </button>
    </div>
    <ElDialog v-model="open" :title="selected ? `[${selected.id}] ${selected.name}` : '引用原文'" width="min(680px, calc(100vw - 32px))" align-center destroy-on-close>
      <p class="muted small">本次检索快照 · 片段 {{ selected?.chunk }} · 高亮为与问题匹配的文字</p>
      <div class="source-original"><template v-for="(part, index) in parts" :key="index"><mark v-if="part.highlight">{{ part.text }}</mark><span v-else>{{ part.text }}</span></template></div>
    </ElDialog>
  </section>
</template>
<style scoped>
.source-evidence{margin-top:16px;padding:18px;border:1px solid #dfe6f0;border-radius:14px;background:linear-gradient(120deg,#f5f8fc,#fff8f9)}.source-heading{display:flex;align-items:center;gap:12px}.source-evidence p{margin:10px 0}.source-list{display:grid;gap:8px}.source-card{display:flex;align-items:center;gap:12px;width:100%;border:1px solid #e1e6ef;background:#fff;border-radius:10px;padding:12px;text-align:left;color:#456398;cursor:pointer}.source-card:hover{border-color:#a8bad8;background:#f8faff}.source-card>span:nth-child(2){flex:1;min-width:0}.source-card strong{display:block;overflow-wrap:anywhere;font-size:13px}.source-card small{display:block;margin-top:5px;color:#7888a0}.source-number{font-weight:700;color:#a34a68}.source-original{white-space:pre-wrap;overflow-wrap:anywhere;max-height:58vh;overflow:auto;line-height:1.9;color:#34465e;background:#f7f9fc;border-radius:12px;padding:20px}.source-original mark{background:#f7dfe7;color:#7f3d59;border-radius:3px}
</style>
