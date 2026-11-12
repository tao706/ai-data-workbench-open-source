<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import { scientificPalette, themeColor } from '../palette';  
import ChartView from '../components/ChartView.vue';  
import type { ChartType, Dataset, SavedChart } from '../types';

const ws = useWorkspace();  

const c = ws.chartDraft;  

const d = ref<Dataset>();  
const chartData = ref<any>();  
const saved = ref<SavedChart[]>([]);  
const busy = ref(false);  
const error = ref('');  
const notice = ref('');  
const savedVersion = ref<number>();  
let restoringDatasetId = '';  

 
const kinds: { id: ChartType; label: string; icon: string }[] = [
  { id: 'bar', label: '柱状图', icon: '▥' },
  { id: 'line', label: '折线图', icon: '⌁' },
  { id: 'area', label: '面积图', icon: '◩' },
  { id: 'pie', label: '饼图', icon: '◕' },
  { id: 'scatter', label: '散点图', icon: '⁙' },
  { id: 'table', label: '数据表', icon: '▤' },
];

 
const numericFields = computed(() => d.value?.fields.filter((f) => f.type === 'number') || []);

 
const valid = computed(
  () =>
    !!d.value &&
    !!c.dimension &&  
    (c.aggregate === 'count' || !!c.metric) &&  
    (c.chartType !== 'scatter' ||  
       
      [c.dimension, c.metric].every((name) => numericFields.value.some((f) => f.name === name))),
);

let previewSequence = 0;  

 
function selectKind(kind: ChartType) {
  c.chartType = kind;  
   
  if (kind === 'pie' && !['count', 'sum'].includes(c.aggregate)) c.aggregate = 'count';
   
  if (kind === 'line' || kind === 'area') c.sort = 'asc';
   
  if (kind === 'scatter') {
     
    if (!numericFields.value.some((f) => f.name === c.dimension))
      c.dimension = numericFields.value[0]?.name || '';
    if (!numericFields.value.some((f) => f.name === c.metric))
      c.metric = numericFields.value.find((f) => f.name !== c.dimension)?.name || numericFields.value[0]?.name || '';
  }
  void preview();  
}

 
async function load() {
  if (!ws.datasetId) {
    d.value = undefined;
    return;
  }
  try {
    d.value = await api('get', `/datasets/${ws.datasetId}`);  
     
    if (!d.value!.fields.some((f) => f.name === c.dimension))
      c.dimension = d.value!.fields.find((f) => f.type !== 'number')?.name || d.value!.fields[0]?.name || '';
    if (!d.value!.fields.some((f) => f.name === c.metric))
      c.metric = d.value!.fields.find((f) => f.type === 'number')?.name || '';
    saved.value = await api('get', `/charts?projectId=${ws.projectId}`);
    await preview();
  } catch (e) {
    error.value = messageOf(e);
  }
}

async function preview() {
  const sequence = ++previewSequence;
  chartData.value = null;
  if (!valid.value) {
    busy.value = false;
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const result = await api('post', '/charts/data', {
      datasetId: d.value!.id,
      version: savedVersion.value,
      chartType: c.chartType,
      dimension: c.dimension,
      metric: c.metric || undefined,
      aggregate: c.aggregate,
      limit: Number(c.limit),
      filterField: c.filterField || undefined,
      filterValue: c.filterValue || undefined,
      sort: c.sort || 'desc',
    });
    if (sequence === previewSequence) chartData.value = result;
  } catch (e) {
    if (sequence === previewSequence) error.value = messageOf(e);
  } finally {
    if (sequence === previewSequence) busy.value = false;
  }
}

async function save() {
  if (!valid.value) return;
  try {
    await api('post', '/charts', {
      projectId: ws.projectId,
      datasetId: d.value!.id,
      version: savedVersion.value,
      title: c.title,
      config: { ...c },
    });
    notice.value = '图表配置已保存';
    saved.value = await api('get', `/charts?projectId=${ws.projectId}`);
  } catch (e) {
    error.value = messageOf(e);
  }
}

 
function restore(item: SavedChart) {
  restoringDatasetId = item.datasetId;
  ws.datasetId = item.datasetId;
  savedVersion.value = item.datasetVersion;
  Object.assign(c, item.config);
  c.color = themeColor(c.color);
  load();
}

watch(() => ws.datasetId, (id) => {
  if (id === restoringDatasetId) { restoringDatasetId = ''; return; }
  savedVersion.value = undefined;
  load();
});
onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-heading">
      <div>
        <h2>可视化工作室</h2>
        <p>选择字段、聚合、筛选与排序，实时预览并保存图表。</p>
      </div>
      <div class="toolbar" style="margin: 0">
        <button class="button ghost" :disabled="!valid || busy" @click="preview">↻ 更新预览</button>
        <button class="button primary" :disabled="!valid" @click="save">＋ 保存图表</button>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="notice" class="success">{{ notice }}</div>
    <div v-if="!d" class="card empty">请先在数据集页面选择一个数据集</div>
    <div v-else class="studio-layout">
       
      <div class="card config-panel">
        <h3>图表类型</h3>
        <div class="chart-kind-grid">
          <button
            v-for="kind in kinds"
            :key="kind.id"
            class="kind-btn"
            :class="{ selected: c.chartType === kind.id }"
            @click="selectKind(kind.id)"
          >
            <div style="font-size: 20px; margin-bottom: 4px">{{ kind.icon }}</div>
            {{ kind.label }}
          </button>
        </div>
        <h3 style="margin-top: 12px">字段映射</h3>
        <label class="field">
          维度 / X 轴
          <AppSelect v-model="c.dimension" @change="preview">
            <option
              v-for="f in c.chartType === 'scatter' ? numericFields : d.fields"
              :key="f.name"
              :value="f.name"
            >
              {{ f.alias || f.name }}
            </option>
          </AppSelect>
        </label>
        <label class="field">
          指标 / Y 轴
          <AppSelect v-model="c.metric" @change="preview">
            <option value="">不选择</option>
            <option v-for="f in d.fields.filter((x) => x.type === 'number')" :key="f.name" :value="f.name">
              {{ f.alias || f.name }}
            </option>
          </AppSelect>
        </label>
        <label v-if="c.chartType !== 'scatter'" class="field">
          聚合方式
          <AppSelect v-model="c.aggregate" @change="preview">
            <option value="count">计数（行数）</option>
            <option value="sum">求和</option>
            <template v-if="c.chartType !== 'pie'">
              <option value="mean">平均值</option>
              <option value="min">最小值</option>
              <option value="max">最大值</option>
            </template>
          </AppSelect>
        </label>
        <label v-if="c.chartType !== 'scatter'" class="field">
          {{ ['line', 'area'].includes(c.chartType) ? '横轴排序' : '指标排序' }}
          <AppSelect v-model="c.sort" @change="preview">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </AppSelect>
        </label>
        <label class="field">
          {{ c.chartType === 'scatter' ? '最多显示点数' : '最多显示类别' }}
          <AppSelect v-model.number="c.limit" @change="preview">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </AppSelect>
        </label>
        <p v-if="c.dimension === c.metric && c.aggregate !== 'count'" class="muted small">
          当前两个轴使用同一字段。分组求和会累加重复值；散点图将呈现对角线。
        </p>
        <p v-if="chartData?.metadata?.note" class="muted small">{{ chartData.metadata.note }}</p>
        <h3 style="margin-top: 10px">可选筛选</h3>
        <label class="field">
          筛选字段
          <AppSelect v-model="c.filterField">
            <option value="">不筛选</option>
            <option v-for="f in d.fields" :key="f.name" :value="f.name">{{ f.alias || f.name }}</option>
          </AppSelect>
        </label>
        <label v-if="c.filterField" class="field">
          等于
          <input v-model="c.filterValue" placeholder="输入字段值" @keyup.enter="preview" />
        </label>
      </div>

       
      <div class="card chart-preview">
        <div class="page-heading" style="margin-bottom: 7px">
          <div>
            <h3 class="card-title" style="margin: 0">{{ c.title }}</h3>
            <p style="margin-top: 6px">{{ d.name }} · V{{ savedVersion ?? d.version }} · {{ c.dimension }} / {{ c.metric || '计数' }}</p>
          </div>
          <span class="badge green">{{ busy ? '计算中' : '实时预览' }}</span>
        </div>
        <div v-if="!valid" class="empty">请配置有效字段。散点图需要两个数值字段。</div>
        <ChartView v-else-if="chartData" :config="c" :data="chartData" />
        <div v-else class="empty">点击更新预览</div>
      </div>

       
      <div class="card config-panel">
        <h3>样式设置</h3>
        <label class="field">图表标题<input v-model="c.title" maxlength="100" /></label>
        <fieldset class="chart-palette">
          <legend>图表配色</legend>
          <div class="palette-modes">
            <label>
              <input type="radio" :checked="c.colorMode !== 'single'" @change="c.colorMode = 'palette'" /> 柔粉与晴蓝
            </label>
            <label>
              <input type="radio" :checked="c.colorMode === 'single'" @change="c.colorMode = 'single'" /> 单色强调
            </label>
          </div>
          <p>类别用颜色区分；连续数据保持同一色系。</p>
          <div class="palette-swatches">
            <button
              v-for="item in scientificPalette"
              :key="item.color"
              type="button"
              :title="item.name"
              :aria-label="item.name"
              :aria-pressed="c.color.toLowerCase() === item.color.toLowerCase()"
              :class="{ chosen: c.color.toLowerCase() === item.color.toLowerCase() }"
              :style="{ backgroundColor: item.color }"
              @click="c.color = item.color"
            />
          </div>
        </fieldset>
        <label class="field">主色微调<input v-model="c.color" type="color" style="height: 40px; padding: 4px" /></label>
        <label class="select-line small"><input v-model="c.showLegend" type="checkbox" /> 显示图例</label>
        <label class="select-line small"><input v-model="c.showLabels" type="checkbox" /> 显示数据标签</label>
        <div style="border-top: 1px solid #eef1f6; padding-top: 16px">
          <h3>已保存图表</h3>
          <div v-if="!saved.length" class="muted small" style="margin-top: 10px">暂无已保存图表</div>
          <button
            v-for="item in saved"
            :key="item.id"
            class="button ghost"
            style="width: 100%; justify-content: flex-start; margin-top: 8px"
            @click="restore(item)"
          >
            ▥ {{ item.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-palette {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.chart-palette legend {
  font-size: 13px;
  font-weight: 600;
  color: #456398;
  margin-bottom: 12px;
}
.palette-modes {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b5667;
}
.palette-modes label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.chart-palette p {
  font-size: 11px;
  color: #76869a;
  line-height: 1.7;
  margin: 10px 0;
}
.palette-swatches {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
  padding: 4px;
}
.palette-swatches button {
  height: 30px;
  border: 2px solid #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e0e6eb;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.palette-swatches button:hover {
  transform: translateY(-2px);
}
.palette-swatches button.chosen {
  box-shadow: 0 0 0 2px #456398;
  position: relative;
}
.palette-swatches button.chosen::after {
  content: '✓';
  color: #293a52;
  background: #ffffffd9;
  border-radius: 50%;
  position: absolute;
  right: -5px;
  top: -7px;
  font-size: 10px;
  width: 14px;
  height: 14px;
}
</style>
