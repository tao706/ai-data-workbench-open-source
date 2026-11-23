<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElDialog } from 'element-plus';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import type { KnowledgeDocument, KnowledgeList } from '../knowledge';
import { modeLabel } from '../knowledge';
import ActionDialog from '../components/ActionDialog.vue';
const ws = useWorkspace();
const documents = ref<KnowledgeDocument[]>([]), mode = ref<'vector' | 'keyword'>('keyword');
const name = ref(''), content = ref(''), file = ref<File>(), fileInput = ref<HTMLInputElement>();
const loading = ref(false), uploading = ref(false), workingId = ref(''), error = ref(''), notice = ref('');
const deleting = ref<KnowledgeDocument>(), deleteError = ref(''), deletingBusy = ref(false);
const viewing = ref(false), original = ref<{ name: string; content: string }>();
const ready = computed(() => documents.value.filter(doc => doc.status === 'ready').length);
let sequence = 0, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  if (!disposed && documents.value.some(doc => doc.status === 'indexing')) timer = setTimeout(() => void load(false), 1800);
}
async function load(showLoading = true) {
  const current = ++sequence, projectId = ws.projectId;
  if (!projectId) { documents.value = []; return; }
  if (showLoading) loading.value = true;
  error.value = '';
  try {
    const data = await api<KnowledgeList>('get', `/knowledge?projectId=${encodeURIComponent(projectId)}`);
    if (disposed || current !== sequence || projectId !== ws.projectId) return;
    documents.value = data.documents; mode.value = data.mode; schedule();
  } catch (cause) { if (!disposed && current === sequence) error.value = messageOf(cause); }
  finally { if (current === sequence) loading.value = false; }
}
function chooseFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0];
  if (file.value && !name.value) name.value = file.value.name.slice(0, 100);
}
async function upload() {
  if (uploading.value || !ws.projectId) return;
  error.value = ''; notice.value = '';
  if (!name.value.trim()) { error.value = '请填写资料名称'; return; }
  if (file.value && (!/\.(txt|md)$/i.test(file.value.name) || file.value.size > 1024 * 1024)) { error.value = '请选择不超过 1 MB 的 UTF-8 TXT 或 Markdown 文件'; return; }
  if (!file.value && (!content.value.trim() || content.value.length > 50000)) { error.value = '请填写 1 至 50000 个字符的资料正文'; return; }
  uploading.value = true;
  try {
    const form = new FormData();form.append('projectId', ws.projectId);form.append('name', name.value.trim());
    if (file.value) form.append('file', file.value); else form.append('content', content.value);
    await api('post', '/knowledge', form);
    if (disposed) return;
    name.value = ''; content.value = ''; file.value = undefined;
    if (fileInput.value) fileInput.value.value = '';
    notice.value = '资料已接收，正在建立索引。完成后即可在 AI 分析中引用。';
    await load();
  } catch (cause) { if (!disposed) error.value = messageOf(cause); }
  finally { uploading.value = false; }
}
async function reindex(doc: KnowledgeDocument) {
  if (workingId.value) return;
  workingId.value = doc.id;error.value = '';notice.value = '';
  try { await api('post', `/knowledge/${doc.id}/reindex`); await load(); }
  catch (cause) { error.value = messageOf(cause); } finally { workingId.value = ''; }
}
async function view(doc: KnowledgeDocument) {
  error.value = '';
  try { original.value = await api('get', `/knowledge/${doc.id}`); if (!disposed) viewing.value = true; }
  catch (cause) { error.value = messageOf(cause); }
}
async function remove() {
  if (!deleting.value || deletingBusy.value) return;
  deletingBusy.value = true;deleteError.value = '';
  try { await api('delete', `/knowledge/${deleting.value.id}`);deleting.value = undefined;notice.value = '资料及其检索索引已删除';await load(); }
  catch (cause) { deleteError.value = messageOf(cause); } finally { deletingBusy.value = false; }
}
onMounted(() => void load());
onBeforeUnmount(() => { disposed = true; sequence++; clearTimeout(timer); });
defineExpose({ refresh: async () => { await load(); if (error.value) throw new Error(error.value); } });
</script>
<template>
  <div class="stack">
    <div class="page-heading"><div><h2>业务资料</h2><p>为当前项目补充指标口径、业务规则和分析背景，让解读有据可查。</p></div><span class="badge">{{ modeLabel(mode) }} · {{ ready }} 份可用</span></div>
    <div v-if="!ws.projectId" class="card empty">请先选择或创建一个项目</div>
    <template v-else>
      <div v-if="error" class="error" role="alert">{{ error }} <button class="button ghost" :disabled="loading" @click="load()">重试加载</button></div>
      <div v-if="notice" class="notice" role="status">{{ notice }}</div>
      <div class="knowledge-layout">
        <form class="card card-pad stack" @submit.prevent="upload">
          <div><h3 class="card-title">添加业务资料</h3><p class="muted small">上传 TXT、Markdown，或直接粘贴正文。资料只在当前项目内检索。</p></div>
          <label class="field">资料名称<input v-model="name" maxlength="100" :disabled="uploading" placeholder="例如：销售指标口径与区域目标" /></label>
          <label class="field">上传文件<input ref="fileInput" type="file" accept=".txt,.md" :disabled="uploading" @change="chooseFile" /></label>
          <p v-if="file" class="muted small">将导入文件内容；清除所选文件后可使用下方正文。</p>
          <label class="field">资料正文<textarea v-model="content" :disabled="uploading || !!file" maxlength="50000" rows="9" placeholder="例如：净销售额为销售额扣除退款后的金额。区域目标按自然月统计……" /></label>
          <p class="muted small">单文件不超过 1 MB，正文最多 50000 字符，每个项目最多 40 份。</p>
          <button class="button primary" type="submit" :disabled="uploading">{{ uploading ? '正在上传与解析…' : '添加并建立索引' }}</button>
        </form>
        <section class="card card-pad stack" aria-label="当前项目资料">
          <div class="page-heading"><h3 class="card-title" style="margin:0">当前项目资料</h3><router-link class="text-link" to="/assistant">去分析 ↗</router-link></div>
          <p class="muted small">{{ mode === 'vector' ? '按语义相似度寻找相关片段。更换检索服务后，请重新建立索引。' : '当前使用关键词检索，根据问题中的关键字寻找资料。' }}</p>
          <p v-if="loading" class="muted" role="status">正在加载资料…</p>
          <div v-else-if="!documents.length" class="empty">还没有业务资料，可先添加指标说明或业务规则。</div>
          <article v-for="doc in documents" :key="doc.id" class="knowledge-item">
            <div class="document-heading"><strong>{{ doc.name }}</strong><span class="badge" :class="doc.status">{{ doc.status === 'ready' ? '可引用' : doc.status === 'failed' ? '索引失败' : '正在索引…' }}</span></div>
            <p class="muted small">{{ doc.characters.toLocaleString('zh-CN') }} 字符 · {{ doc.chunkCount }} 个片段 · {{ modeLabel(doc.mode) }}</p>
            <p v-if="doc.error" class="error" role="alert">{{ doc.error }}</p>
            <div class="document-actions"><button class="button ghost" @click="view(doc)">查看原文</button><button class="button ghost" :disabled="doc.status === 'indexing' || !!workingId" @click="reindex(doc)">{{ workingId === doc.id ? '提交中…' : doc.status === 'failed' ? '重试索引' : '重新索引' }}</button><button class="button ghost" :aria-label="`删除资料 ${doc.name}`" @click="deleting = doc; deleteError = ''"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>
          </article>
        </section>
      </div>
    </template>
    <ActionDialog :open="!!deleting" title="删除业务资料" :description="`确定删除「${deleting?.name || ''}」吗？原文及其检索索引会删除，已有分析中的引用快照会保留。`" confirm-label="确认删除" danger :busy="deletingBusy" :error-message="deleteError" @cancel="deleting = undefined" @confirm="remove" />
    <ElDialog v-model="viewing" :title="original?.name || '资料原文'" width="min(720px, calc(100vw - 32px))" align-center><pre class="document-original">{{ original?.content }}</pre></ElDialog>
  </div>
</template>
<style scoped>
.knowledge-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:24px;align-items:start}.knowledge-item{padding:18px 0;border-top:1px solid #e5eaf2}.document-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.document-heading strong{overflow-wrap:anywhere}.document-actions{display:flex;gap:8px;flex-wrap:wrap}.document-original{white-space:pre-wrap;overflow-wrap:anywhere;max-height:65vh;overflow:auto;padding:18px;line-height:1.9;background:#f7f9fc;color:#34465e;border-radius:12px;font:inherit}.badge.failed{color:#a34a68;background:#fbecef}.badge.indexing{color:#9b7739;background:#f8f2e5}.badge.ready{color:#4f7b6b;background:#eef6f1}.notice{padding:14px 18px;background:#edf5f1;color:#436d5d;border:1px solid #dcece3;border-radius:12px}.knowledge-layout textarea{min-height:180px}@media(max-width:960px){.knowledge-layout{grid-template-columns:1fr}}
</style>
