<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import type { Dataset } from '../types';

 
type CleanRule = { 
  operation: string;  
   field?: string;  
   value?: string  
};

 
const operationNames: Record<string, string> = {
  drop_missing: '删除缺失值所在行',
  fill_mean: '均值填充',
  fill_median: '中位数填充',
  fill_mode: '众数填充',
  fill_value: '固定值填充',
  drop_duplicates: '删除重复行',
  cast_number: '转换为数字',
  cast_text: '转换为文本',
  cast_date: '转换为日期',
  iqr_drop: 'IQR 删除异常值',
  iqr_clip: 'IQR 截断异常值',
};

 
const numericOperations = new Set([
  'fill_mean',  
  'fill_median',  
  'iqr_drop',  
  'iqr_clip'  
]);

const ws = useWorkspace();  
const datasets = ref<Dataset[]>([]),  
  datasetLoading = ref(false);  
const d = ref<Dataset>(),  
  operation = ref('drop_missing'),  
  field = ref(''),  
  value = ref('');  
const rules = ref<CleanRule[]>([]),  
  result = ref<any>(),  
  busy = ref(false),  
  error = ref('');  

 
const needsField = computed(() => operation.value !== 'drop_duplicates');

 
const needsValue = computed(() => operation.value === 'fill_value');

 
const selectedField = computed(() => d.value?.fields.find((f) => f.name === field.value));

 
const numericRule = computed(() => numericOperations.has(operation.value));

 
const availableFields = computed(() =>
  numericRule.value ? d.value?.fields.filter((f) => f.type === 'number') || [] : d.value?.fields || [],
);
let datasetRequestSequence = 0;  

 
const validation = computed(() => {
  if (!d.value) return '请先选择数据集。';
  if (!needsField.value) return ''; 
   
  if (numericRule.value && !availableFields.value.length) return '当前数据集没有数值字段。请选择其他处理方式。';
   
  if (!field.value || !selectedField.value) return '请选择目标字段。';
   
  if (numericRule.value && selectedField.value.type !== 'number')
    return `「${field.value}」不是数值字段。${operationNames[operation.value]}只能用于数值字段，请选择数值字段或更换处理方式。`;
   
  if (numericRule.value && selectedField.value.unique === 0)
    return `「${field.value}」没有可用于计算的数值，请更换字段。`;
   
  if (operation.value === 'fill_mode' && selectedField.value.unique === 0)
    return `「${field.value}」没有可用于计算众数的值，请更换字段。`;
   
  if (operation.value === 'fill_value' && !value.value.trim()) return '请输入固定填充值。';
  return '';
});

 
watch([operation, d], () => {
  if (needsField.value && !availableFields.value.some((f) => f.name === field.value))
    field.value = availableFields.value[0]?.name || '';
});

 
async function load() {
  const sequence = ++datasetRequestSequence;
   
  if (!ws.datasetId) {
    d.value = undefined;
    return;
  }
  try {
    const dataset = await api<Dataset>('get', `/datasets/${ws.datasetId}`);
    if (sequence !== datasetRequestSequence) return;
    d.value = dataset;
     
    field.value = d.value?.fields[0]?.name || '';
  } catch (e) {
    if (sequence !== datasetRequestSequence) return;
    d.value = undefined;
    error.value = messageOf(e);
  }
}

 
async function loadProjectDatasets() {
  const projectId = ws.projectId;
  datasets.value = [];
  d.value = undefined;
  rules.value = [];
  result.value = undefined;
  error.value = '';
  if (!projectId) return;
  datasetLoading.value = true;
  try {
    const items = await api<Dataset[]>('get', `/datasets?projectId=${encodeURIComponent(projectId)}`);
    if (projectId !== ws.projectId) return;
    datasets.value = items;
    if (!items.some((item) => item.id === ws.datasetId)) ws.datasetId = items[0]?.id || '';
    else await load();
  } catch (e) {
    if (projectId === ws.projectId) error.value = messageOf(e);
  } finally {
    if (projectId === ws.projectId) datasetLoading.value = false;
  }
}

 
function add() {
  error.value = '';
   
  if (validation.value) {
    error.value = validation.value;
    return;
  }
   
  rules.value.push({
    operation: operation.value,  
    ...(needsField.value ? { field: field.value } : {}),  
    ...(needsValue.value ? { value: value.value.trim() } : {}),  
  });
}

 
function cleanError(e: unknown) {
  const message = messageOf(e);  
   
  const numeric = message.match(/^(.+) has no numeric values$/);
   
  if (numeric) return `「${numeric[1]}」没有可计算的数值，请移除或更换对应规则。`;
   
  const mode = message.match(/^(.+) has no mode$/);
   
  if (mode) return `「${mode[1]}」没有可用于众数填充的值，请移除或更换对应规则。`;
  if (message === 'Cleaning removed every row') return '清洗结果为空。请检查规则顺序和目标字段。';
  return message;  
}

 
async function run() {
   
  if (!d.value || !rules.value.length) return;
  busy.value = true;   
  error.value = '';
  try {
     
    result.value = await api('post', `/datasets/${d.value.id}/clean`, { rules: rules.value });
    rules.value = [];  
    await load();  
  } catch (e) {
    error.value = cleanError(e);
  } finally {
    busy.value = false;  
  }
}

 
watch(
  () => ws.datasetId,
  () => {
    rules.value = [];
    result.value = undefined;
    error.value = '';
    if (datasets.value.some((item) => item.id === ws.datasetId)) load();
    else d.value = undefined;
  },
);

watch(() => ws.projectId, loadProjectDatasets, { immediate: true });
</script>

<template>
  <div class="stack">
    <div class="page-heading">
      <div>
        <h2>数据清洗</h2>
        <p>组合规则并保存为新的数据集版本，原始版本仍可追溯。</p>
      </div>
      <label class="field clean-dataset-picker">
        清洗数据集
        <AppSelect v-model="ws.datasetId" :disabled="datasetLoading || busy || !datasets.length">
          <option v-for="item in datasets" :key="item.id" :value="item.id">
            {{ item.name }} · V{{ item.version }} · {{ item.rows.toLocaleString('zh-CN') }} 行
          </option>
        </AppSelect>
      </label>
    </div>
    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <div v-if="datasetLoading" class="card empty">正在加载当前项目的数据集…</div>
    <div v-else-if="!datasets.length" class="card empty">当前项目还没有数据集，请先到数据集页面导入数据。</div>
    <div v-else-if="!d" class="card empty">请选择要处理的数据集。</div>
    <template v-else>
      <div class="grid-4">
        <div class="card stat-card">
          <div class="stat-label">当前数据集</div>
          <div class="clean-dataset-name">{{ d.name }}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">当前版本</div>
          <div class="stat-number">V{{ d.version }}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">数据行数</div>
          <div class="stat-number">{{ d.rows }}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">重复行</div>
          <div class="stat-number">{{ d.duplicates }}</div>
        </div>
      </div>
      <div class="grid-2">

         
        <div class="card card-pad stack">
          <h3 class="card-title">添加清洗规则</h3>
          <label class="field">
            处理方式
            <AppSelect v-model="operation">
              <option v-for="(name, key) in operationNames" :key="key" :value="key">{{ name }}</option>
            </AppSelect>
          </label>
          <label v-if="needsField" class="field">
            目标字段
            <AppSelect v-model="field">
              <option v-for="f in availableFields" :key="f.name" :value="f.name">
                {{ f.name }} · {{ f.type === 'number' ? '数值' : f.type === 'date' ? '日期' : '文本' }}
              </option>
            </AppSelect>
          </label>
          <label v-if="needsValue" class="field">填充值<input v-model="value" placeholder="输入固定值" /></label>
          <p v-if="numericRule" class="clean-hint">此处理方式仅适用于数值字段。</p>
          <p v-if="validation" class="clean-validation" role="alert">{{ validation }}</p>
          <button class="button secondary" :disabled="!!validation" @click="add">＋ 加入规则列表</button>
        </div>

         
        <div class="card card-pad clean-queue">
          <h3 class="card-title">待执行规则 <span class="muted">{{ rules.length }}</span></h3>
          <div v-if="!rules.length" class="empty">先在左侧添加规则</div>
          <div v-for="(r, i) in rules" :key="i" class="select-line clean-rule">
            <span class="badge">{{ i + 1 }}</span>
            <span class="clean-rule-text"
              >{{ operationNames[r.operation] || r.operation }} · {{ r.field || '整表' }} {{ r.value || '' }}</span
            >
            <button class="icon-button" :aria-label="`删除第 ${i + 1} 条规则`" @click="rules.splice(i, 1)">×</button>
          </div>
          <button class="button primary clean-run" :disabled="!rules.length || busy" @click="run">
            {{ busy ? '正在清洗…' : '执行并保存新版本' }}
          </button>
        </div>
      </div>
      
       
      <div v-if="result" class="card card-pad">
        <h3 class="card-title">本次处理结果</h3>
        <div class="success">
          已生成 V{{ result.dataset.version }}：{{ result.task.result.beforeRows }} 行 →
          {{ result.task.result.afterRows }} 行
        </div>
        <div class="pill-row" style="margin-top: 15px">
          <span v-for="(r, i) in result.task.result.changes" :key="i" class="pill">
            {{ operationNames[r.operation] || r.operation }} · 减少 {{ r.affectedRows }} 行
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.clean-dataset-picker {
  width: min(390px, 42%);
  margin: 0;
}
.clean-dataset-name {
  margin-top: 18px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.clean-hint {
  margin: 0;
  color: #6b7e93;
  font-size: 12px;
}
.clean-validation {
  margin: 0;
  padding: 10px 12px;
  background: #fff1f3;
  border: 1px solid #f4cbd3;
  border-radius: 9px;
  color: #a34a68;
  font-size: 12px;
  line-height: 1.6;
}
.clean-rule {
  padding: 10px;
  border-bottom: 1px solid #edf0f4;
}
.clean-rule-text {
  flex: 1;
  font-size: 12px;
}
.clean-run {
  margin-top: 20px;
}
.clean-queue {
  display: flex;
  flex-direction: column;
}
.clean-queue .empty {
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 100px;
}
@media (max-width: 760px) {
  .clean-dataset-picker {
    width: 100%;
  }
}
</style>
