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
function clearFile() {
  file.value = undefined;
  if (fileInput.value) fileInput.value.value = '';
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
  <div class="stack knowledge-page">
    <div class="page-heading"><div><h2>业务资料</h2><p>为当前项目补充指标口径、业务规则和分析背景，让解读有据可查。</p></div><span class="badge">{{ modeLabel(mode) }} · {{ ready }} 份可用</span></div>
    <div v-if="!ws.projectId" class="card empty">请先选择或创建一个项目</div>
    <template v-else>
      <div v-if="error" class="error" role="alert">{{ error }} <button class="button ghost" :disabled="loading" @click="load()">重试加载</button></div>
      <div v-if="notice" class="notice" role="status">{{ notice }}</div>
      <div class="knowledge-layout">
        <form class="card card-pad stack knowledge-form" @submit.prevent="upload">
          <div><h3 class="card-title">添加业务资料</h3><p class="muted small">上传 TXT、Markdown，或直接粘贴正文。资料只在当前项目内检索。</p></div>
          <label class="field">资料名称<input v-model="name" maxlength="100" :disabled="uploading" placeholder="例如：销售指标口径与区域目标" /></label>
          <div class="field"><span>上传文件</span>
            <div class="file-picker" :class="{ 'has-file': file, 'is-disabled': uploading }">
              <input ref="fileInput" class="file-input" type="file" accept=".txt,.md" aria-label="上传文件" :disabled="uploading" @change="chooseFile" />
              <button class="button file-choose" type="button" :disabled="uploading" @click="fileInput?.click()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>{{ file ? '更换文件' : '选择文件' }}
              </button>
              <div class="file-description"><span :title="file?.name">{{ file?.name || '未选择文件' }}</span><small>{{ file ? `${(file.size / 1024).toFixed(1)} KB · 已选择，等待上传` : 'TXT / Markdown · 不超过 1 MB' }}</small></div>
              <button v-if="file" class="file-clear" type="button" aria-label="清除所选文件" title="清除所选文件" :disabled="uploading" @click="clearFile"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
            </div>
          </div>
          <p v-if="file" class="muted small">将导入文件内容；清除所选文件后可使用下方正文。</p>
          <label class="field knowledge-body">资料正文<textarea v-model="content" :disabled="uploading || !!file" maxlength="50000" rows="9" placeholder="例如：净销售额为销售额扣除退款后的金额。区域目标按自然月统计……" /></label>
          <p class="muted small">单文件不超过 1 MB，正文最多 50000 字符，每个项目最多 40 份。</p>
          <button class="button primary knowledge-submit" type="submit" :disabled="uploading">{{ uploading ? '正在上传与解析…' : '添加并建立索引' }}</button>
        </form>
        <section class="card card-pad stack knowledge-library" aria-label="当前项目资料">
          <div class="page-heading"><h3 class="card-title" style="margin:0">当前项目资料</h3><router-link class="button knowledge-analysis" to="/assistant">去分析 ↗</router-link></div>
          <p class="muted small">{{ mode === 'vector' ? '按语义相似度寻找相关片段。更换检索服务后，请重新建立索引。' : '当前使用关键词检索，根据问题中的关键字寻找资料。' }}</p>
          <div class="knowledge-document-list" tabindex="0" aria-label="业务资料列表">
          <div v-if="loading" class="knowledge-empty muted" role="status">正在加载资料…</div>
          <div v-else-if="!documents.length" class="knowledge-empty"><span class="knowledge-empty-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 12h8M8 16h6"/></svg></span><strong>暂无业务资料</strong><p>还没有业务资料，可先添加指标说明或业务规则。</p></div>
          <article v-for="doc in documents" :key="doc.id" class="knowledge-item">
            <div class="document-heading"><strong>{{ doc.name }}</strong><span class="badge" :class="doc.status">{{ doc.status === 'ready' ? '可引用' : doc.status === 'failed' ? '索引失败' : '正在索引…' }}</span></div>
            <p class="muted small">{{ doc.characters.toLocaleString('zh-CN') }} 字符 · {{ doc.chunkCount }} 个片段 · {{ modeLabel(doc.mode) }}</p>
            <p v-if="doc.error" class="error" role="alert">{{ doc.error }}</p>
            <div class="document-actions"><button class="button document-view" @click="view(doc)">查看原文</button><button class="button document-reindex" :disabled="doc.status === 'indexing' || !!workingId" @click="reindex(doc)">{{ workingId === doc.id ? '提交中…' : doc.status === 'failed' ? '重试索引' : '重新索引' }}</button><button class="button document-delete" :aria-label="`删除资料 ${doc.name}`" @click="deleting = doc; deleteError = ''"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>
          </article>
          </div>
        </section>
      </div>
    </template>
    <ActionDialog :open="!!deleting" title="删除业务资料" :description="`确定删除「${deleting?.name || ''}」吗？原文及其检索索引会删除，已有分析中的引用快照会保留。`" confirm-label="确认删除" danger :busy="deletingBusy" :error-message="deleteError" @cancel="deleting = undefined" @confirm="remove" />
    <ElDialog v-model="viewing" :title="original?.name || '资料原文'" width="min(720px, calc(100vw - 32px))" align-center><pre class="document-original">{{ original?.content }}</pre></ElDialog>
  </div>
</template>
<style scoped>
.knowledge-layout{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:24px;align-items:stretch}.knowledge-item{padding:18px 0;border-top:1px solid #e5eaf2}.document-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.document-heading strong{overflow-wrap:anywhere}.document-actions{display:flex;gap:8px;flex-wrap:wrap}.document-original{white-space:pre-wrap;overflow-wrap:anywhere;max-height:65vh;overflow:auto;padding:18px;line-height:1.9;background:#f7f9fc;color:#34465e;border-radius:12px;font:inherit}.badge.failed{color:#a34a68;background:#fbecef}.badge.indexing{color:#9b7739;background:#f8f2e5}.badge.ready{color:#4f7b6b;background:#eef6f1}.notice{padding:14px 18px;background:#edf5f1;color:#436d5d;border:1px solid #dcece3;border-radius:12px}.knowledge-layout textarea{min-height:180px}@media(max-width:960px){.knowledge-layout{grid-template-columns:1fr}}

.knowledge-page .button{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;transition:background .2s,border-color .2s,box-shadow .2s,transform .2s}
.file-picker{position:relative;display:flex;align-items:center;gap:14px;min-height:82px;padding:15px;border:1px solid #dce5f0;border-radius:13px;background:linear-gradient(115deg,#f1f5fc,#fcf6f9);transition:border-color .2s,box-shadow .2s}
.file-picker:focus-within{border-color:#8ca7ce;box-shadow:0 0 0 3px #bfd7ea4d}
.file-picker.has-file{background:linear-gradient(115deg,#edf4fc,#fcf5f8);border-color:#b9cce5}
.file-picker .file-input{position:absolute;width:1px;height:1px;min-height:0;padding:0;border:0;clip-path:inset(50%);overflow:hidden;white-space:nowrap}
.knowledge-page .file-choose{flex-shrink:0;min-height:40px;padding:0 15px;border:1px solid #5b79ad;border-radius:10px;background:linear-gradient(125deg,#7899ca,#526fa6);color:#fff;box-shadow:0 3px 9px #45639822,inset 0 1px 0 #ffffff30}
.knowledge-page .file-choose:hover:not(:disabled){background:linear-gradient(125deg,#6b8bbb,#456398);box-shadow:0 5px 12px #45639830;transform:translateY(-1px)}
.file-description{min-width:0;flex:1;color:#4a6287}.file-description>span{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:600}.file-description small{display:block;margin-top:6px;color:#8190a8;font-size:11px;font-weight:400}
.file-clear{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:8px;color:#a16c83;background:transparent;cursor:pointer}.file-clear:hover:not(:disabled){background:#f7e5ed;border-color:#ebccd9;color:#984b69}.file-clear:focus-visible{outline:2px solid #8ca7ce;outline-offset:2px}
.knowledge-page .document-view{color:#456398;border:1px solid #ccdaed;background:#edf3fb}.knowledge-page .document-view:hover:not(:disabled){background:#e1ebf8;border-color:#9fb8db;box-shadow:0 3px 9px #45639814}
.knowledge-page .document-reindex{color:#99617c;border:1px solid #ecd4df;background:#fbf0f5}.knowledge-page .document-reindex:hover:not(:disabled){background:#f5e2eb;border-color:#dcb3c7;box-shadow:0 3px 9px #a35b7914}
.knowledge-page .document-delete{min-width:36px;color:#a16b82;border:1px solid #eddae2;background:#fff7fa}.knowledge-page .document-delete:hover:not(:disabled){color:#a04869;border-color:#dcaec1;background:#f9e3eb;box-shadow:0 3px 9px #a35b7914}
.knowledge-page .knowledge-analysis{font-size:12px;color:#4d6d9f;border:1px solid #d7e2f1;background:linear-gradient(120deg,#edf3fb,#f9f0f5);padding:8px 13px}.knowledge-page .knowledge-analysis:hover{border-color:#a8bfdc;background:#e8f0fb;box-shadow:0 3px 9px #45639815}
.knowledge-page .knowledge-submit{min-height:42px;border-color:#5875a7;background:linear-gradient(120deg,#7898c7,#526da3);box-shadow:0 4px 12px #45639825,inset 0 1px 0 #ffffff25}.knowledge-page .knowledge-submit:hover:not(:disabled){background:linear-gradient(120deg,#6686b8,#456398);box-shadow:0 6px 15px #45639830;transform:translateY(-1px)}
.knowledge-page button:disabled{cursor:not-allowed;transform:none;box-shadow:none}.file-picker.is-disabled{opacity:.65}
@media(max-width:540px){.file-picker{flex-wrap:wrap;gap:10px}.file-description{flex-basis:calc(100% - 50px);order:2}.file-clear{margin-left:auto}.file-description small{font-size:12px}}
@media(prefers-reduced-motion:reduce){.knowledge-page .button{transition:none}.knowledge-page .button:hover{transform:none}}


.knowledge-layout>.knowledge-form,.knowledge-layout>.knowledge-library{display:flex;flex-direction:column;min-width:0;gap:18px;align-self:stretch}
.knowledge-body{flex:1;display:flex;flex-direction:column}.knowledge-body textarea{flex:1}
.knowledge-library>.page-heading{flex-shrink:0;margin-bottom:0}.knowledge-library>.muted{flex-shrink:0;margin:0;line-height:1.8}
.knowledge-document-list{flex:1;min-height:260px;contain:size;overflow:auto;padding-right:4px;scrollbar-width:thin;scrollbar-color:#becce1 transparent;outline-offset:4px}
.knowledge-document-list .knowledge-item:first-child{border-top:0;padding-top:4px}
.knowledge-empty{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:30px 22px;border:1px dashed #dce5f0;border-radius:14px;background:linear-gradient(145deg,#f6f9fd,#fcf7fa);color:#71849f}
.knowledge-empty-icon{display:grid;place-items:center;width:62px;height:62px;border-radius:18px;background:linear-gradient(135deg,#e4edf9,#f4e7f0);color:#6a86b1}.knowledge-empty strong{color:#526c94;font-size:15px}.knowledge-empty p{margin:0;max-width:360px;font-size:13px;line-height:1.9}
@media(max-width:960px){.knowledge-document-list{contain:none;flex:initial;min-height:220px;max-height:560px}.knowledge-empty{min-height:220px}.knowledge-body{flex:initial}}

</style>
