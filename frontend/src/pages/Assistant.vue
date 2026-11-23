<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api, messageOf, streamAi } from '../api';
import { useWorkspace } from '../store';
import AnalysisResult from '../components/AnalysisResult.vue';
import SourceEvidence from '../components/SourceEvidence.vue';
import { modeLabel } from '../knowledge';
import type { KnowledgeList, Retrieval } from '../knowledge';
import type { Dataset } from '../types';
const ws = useWorkspace();
const d = ref<Dataset>(), question = ref(''), plan = ref<any>(), answer = ref(''), stage = ref(''), progress = ref(0), busy = ref(false), planning = ref(false), error = ref('');
const result = ref<any>(), resultSource = ref(''), resultQuestion = ref(''), modelMode = ref<'model' | 'demo' | ''>('');
const useKnowledge = ref(true), knowledge = ref<KnowledgeList>({ mode: 'keyword', documents: [] });
const emptyRetrieval = (): Retrieval => ({ mode: 'off', sources: [], notice: '本次未引用业务资料' });
const retrieval = ref<Retrieval>(emptyRetrieval()), evidence = ref<InstanceType<typeof SourceEvidence>>();
const planLabels: Record<string, string> = { descriptive: '描述统计', groupby: '分组聚合', correlation: '相关性分析' };
const readyCount = computed(() => knowledge.value.documents.filter(doc => doc.status === 'ready').length);
const answerParts = computed(() => answer.value.split(/(\[S\d+\])/g).map(text => ({ text, source: retrieval.value.sources.find(source => `[${source.id}]` === text) })));
let controller: AbortController | undefined, loadSequence = 0, planSequence = 0, disposed = false;
async function load() {
  const sequence = ++loadSequence, projectId = ws.projectId;
  if (!projectId) { d.value = undefined; ws.datasets = []; return; }
  try {
    const [datasets, documents] = await Promise.all([api<Dataset[]>('get', `/datasets?projectId=${projectId}`), api<KnowledgeList>('get', `/knowledge?projectId=${projectId}`)]);
    if (disposed || sequence !== loadSequence || projectId !== ws.projectId) return;
    ws.datasets = datasets; knowledge.value = documents;
    const selected = datasets.find(dataset => dataset.id === ws.datasetId);
    if (!selected) { d.value = undefined; return; }
    const dataset = await api<Dataset>('get', `/datasets/${selected.id}`);
    if (!disposed && sequence === loadSequence && dataset.id === ws.datasetId) {
      if (d.value && d.value.version !== dataset.version) plan.value = undefined;
      d.value = dataset;
    }
  } catch (cause) { if (!disposed && sequence === loadSequence) error.value = messageOf(cause); }
}
watch([question, useKnowledge], () => { planSequence++; plan.value = undefined; });
watch(() => ws.datasetId, () => { stop();planSequence++;plan.value = undefined;d.value = undefined;answer.value = '';result.value = undefined;void load(); });
async function makePlan() {
  if (!d.value || busy.value || planning.value) return;
  const sequence = ++planSequence;
  planning.value = true;error.value = '';plan.value = undefined;
  try {
    const next = await api('post', '/ai/plan', { datasetId: d.value.id, question: question.value, useKnowledge: useKnowledge.value });
    if (!disposed && sequence === planSequence) plan.value = next;
  } catch (cause) { if (!disposed && sequence === planSequence) error.value = messageOf(cause); }
  finally { if (!disposed) planning.value = false; }
}
async function run() {
  if (!plan.value || !d.value || busy.value) return;
  const current = new AbortController(); controller = current;
  busy.value = true;answer.value = '';result.value = undefined;error.value = '';progress.value = 0;modelMode.value = '';retrieval.value = emptyRetrieval();
  const dataset = d.value;
  resultSource.value = `${dataset.name} · 版本 ${dataset.version} · ${dataset.rows.toLocaleString('zh-CN')} 行`;
  resultQuestion.value = question.value;
  stage.value = '正在核对业务资料与分析计划';
  try {
    await streamAi({ datasetId: dataset.id, question: question.value, plan: plan.value, useKnowledge: useKnowledge.value }, (event, data) => {
      if (disposed || controller !== current) return;
      if (event === 'meta') modelMode.value = data.model === 'langchain' ? 'model' : 'demo';
      if (event === 'sources') retrieval.value = data;
      if (event === 'progress') { stage.value = data.stage; progress.value = data.progress; }
      if (event === 'token') answer.value += data.text;
      if (event === 'done') { progress.value = 100;result.value = data.result;stage.value = '分析完成'; }
      if (event === 'error') { error.value = data.message;stage.value = '分析失败'; }
    }, current.signal);
  } catch (cause) { if (!current.signal.aborted && !disposed && controller === current) { error.value = messageOf(cause);stage.value = '分析失败'; } }
  finally { if (controller === current) busy.value = false; }
}
function stop() { if (busy.value) { controller?.abort();controller = undefined;stage.value = '已停止生成';busy.value = false; } }
async function copy() { try { await navigator.clipboard.writeText(answer.value); } catch { error.value = '复制失败，请手动选择内容复制'; } }
onMounted(() => void load());
onBeforeUnmount(() => { disposed = true;loadSequence++;planSequence++;stop(); });
defineExpose({ refresh: async () => { error.value = '';await load();if (error.value) throw new Error(error.value); } });
</script>
<template>
  <div class="stack">
    <div class="page-heading"><div><h2>AI 分析助手</h2><p>结合业务资料确认分析计划，查看有计算依据和原文引用的解读。</p></div><router-link class="button ghost" to="/knowledge">管理业务资料 ↗</router-link></div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <div class="card card-pad assistant-context">
      <label class="field">分析数据集<AppSelect v-model="ws.datasetId" :disabled="busy || planning" aria-label="分析数据集"><option value="">请选择数据集</option><option v-for="dataset in ws.datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }}</option></AppSelect></label>
      <div><label class="knowledge-toggle"><input v-model="useKnowledge" type="checkbox" :disabled="busy || planning" /> 参考当前项目业务资料 <span class="badge">{{ readyCount }} 份可用</span></label><p class="muted small">{{ modeLabel(knowledge.mode) }} · {{ readyCount ? '资料用于解释指标和规则，数值仍由程序计算。' : '暂无可用资料，可先添加资料，或仅分析数据。' }}</p></div>
    </div>
    <div v-if="!d" class="card empty">请选择当前项目的数据集后开始分析。</div>
    <template v-else>
      <div class="grid-2 assistant-input">
        <div class="card card-pad stack">
          <div><h3 class="card-title">向数据提问</h3><p class="muted small">{{ d.name }} · {{ d.rows.toLocaleString('zh-CN') }} 行</p></div>
          <label class="field">分析问题<textarea v-model="question" :disabled="busy || planning" maxlength="500" placeholder="例如：按区域对比销售额，并结合指标说明解读结果" /></label>
          <div class="pill-row"><button v-for="text in ['这份数据有哪些主要特征？', '按区域对比销售额，并说明统计口径', '数值字段之间有相关性吗？']" :key="text" class="button ghost" :disabled="busy || planning" @click="question = text">{{ text }}</button></div>
          <button class="button primary" :disabled="busy || planning || question.trim().length < 2" @click="makePlan">{{ planning ? '正在检索资料与生成计划…' : '生成分析计划' }}</button>
          <div v-if="plan" class="plan-panel"><span class="muted small">待确认的分析计划</span><h3>{{ plan.title }}</h3><div class="pill-row"><span class="pill">{{ planLabels[plan.type] }}</span><span v-if="plan.dimension" class="pill">分组：{{ plan.dimension }}</span><span v-if="plan.metric" class="pill">指标：{{ plan.metric }}</span><span v-if="plan.type === 'groupby'" class="pill">汇总：{{ plan.aggregate === 'mean' ? '平均值' : '求和' }}</span></div>
            <p class="muted small">请核对字段和统计口径。业务资料不会自动更改计算公式。</p>
            <SourceEvidence v-if="plan.retrieval && useKnowledge" :retrieval="plan.retrieval" :question="question" />
            <button v-if="!busy" class="button primary" @click="run">确认并执行</button><button v-else class="button danger" @click="stop">停止生成</button>
          </div>
        </div>
        <div class="card card-pad"><h3 class="card-title">分析进度</h3><div class="progress-track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" :style="{ width: progress + '%' }" /></div><p class="muted small">{{ stage || '等待确认分析计划' }}</p><ol class="analysis-steps"><li>检索业务口径，确认分析范围与计算方式</li><li>读取数据并执行统计计算</li><li>结合参考资料生成解读，保留原文引用</li></ol><p class="muted small">资料不足时会明确提示。相关性不代表因果，统计结果也不能单独证明业务原因。</p></div>
      </div>
      <div v-if="answer || busy" class="card card-pad"><div class="page-heading"><h3 class="card-title" style="margin:0">分析解读 <span v-if="modelMode" class="badge">{{ modelMode === 'model' ? '模型解读' : '演示解读' }}</span></h3><button class="button ghost" :disabled="!answer" @click="copy">复制解读</button></div>
        <p class="muted small">本次问题：{{ resultQuestion }}</p>
        <div class="ai-message"><template v-for="(part, index) in answerParts" :key="index"><button v-if="part.source" class="inline-citation" :aria-label="`查看引用 ${part.source.id}`" @click="evidence?.show(part.source)">{{ part.text }}</button><span v-else>{{ part.text }}</span></template></div>
        <SourceEvidence v-if="retrieval.mode !== 'off'" ref="evidence" :retrieval="retrieval" :question="resultQuestion" />
        <p class="muted small">{{ resultSource }}</p>
      </div>
      <AnalysisResult v-if="result" :result="result" :source="resultSource" />
    </template>
  </div>
</template>
<style scoped>
.assistant-context{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.2fr);gap:28px;align-items:center}.assistant-context p{margin:10px 0 0}.knowledge-toggle{display:flex;align-items:center;gap:8px;font-size:14px}.knowledge-toggle input{width:16px;height:16px;accent-color:#5877ad}.assistant-input{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)}.plan-panel{background:#fff9f5;border:1px solid #eadfe2;border-radius:12px;padding:18px}.plan-panel h3{font-size:16px;margin:8px 0 12px}.plan-panel>.button{margin-top:16px}.analysis-steps{padding-left:22px;margin-top:26px;color:#456398;font-size:14px;line-height:2.5}.inline-citation{display:inline;border:0;background:#eaf0f9;color:#456398;border-radius:4px;font:inherit;font-weight:600;padding:0 4px;cursor:pointer}.inline-citation:hover{text-decoration:underline;background:#dce7f6}@media(max-width:900px){.assistant-context,.assistant-input{grid-template-columns:1fr}}
</style>
