<script setup lang="ts">
import { computed, ref, watch } from 'vue';
const props = defineProps<{ result: any; source: string }>();
const tab = ref('statistics');
const format = (value: unknown, digits = 4): string => value == null ? '—' : typeof value === 'number' ? Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—' : String(value);
const numeric = computed(() => Object.entries(props.result.numeric || {}) as [string, Record<string, unknown>][]);
const matrix = computed(() => Array.isArray(props.result.matrix));
const grouped = computed(() => Array.isArray(props.result.categories));
const fields = computed(() => Array.isArray(props.result.fields) && !matrix.value ? props.result.fields : []);
const labels: Record<string, string> = { count: '有效数量', mean: '平均值', median: '中位数', std: '标准差', min: '最小值', q1: '下四分位数', q3: '上四分位数', max: '最大值' };
const aggregates: Record<string, string> = { count: '行数', sum: '合计', mean: '平均值', min: '最小值', max: '最大值' };
const detailNames: Record<string, string> = {
  duplicates: '重复行数', fields: '字段', numeric: '数值统计', categories: '分组项目',
  series: '统计值', matrix: '相关系数矩阵', metadata: '计算条件', dimension: '分组字段',
  metric: '统计字段', aggregate: '计算方式', beforeRows: '清洗前行数', afterRows: '清洗后行数',
};
const detailRows = computed(() => {
  const rows: { name: string; value: string }[] = [];
  const visit = (value: unknown, name: string) => {
    if (Array.isArray(value)) {
      if (value.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))) {
        rows.push({ name, value: value.length ? value.map((item) => format(item)).join('、') : '无' });
        return;
      }
      value.forEach((item, index) => visit(item, `${name} · 第 ${index + 1} 项`));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
        visit(item, name ? `${name} · ${detailNames[key] || key}` : detailNames[key] || key),
      );
      return;
    }
    rows.push({ name, value: format(value) });
  };
  visit(props.result, '计算结果');
  return rows;
});
watch(() => props.result, () => { tab.value = numeric.value.length ? 'statistics' : 'fields'; }, { immediate: true });
function heat(value: unknown, row: number, column: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return {};
  if (row === column) return { backgroundColor: '#f1f5f9', color: '#536781' };
  const intensity = Math.min(1, Math.abs(value));
  const alpha = 0.08 + intensity * 0.48;
  return {
    backgroundColor: value < 0 ? `rgba(91,127,185,${alpha})` : `rgba(225,130,157,${alpha})`,
    color: '#293a52',
  };
}
</script>

<template>
  <section class="card card-pad result-panel" aria-label="分析计算结果">
    <div class="result-heading"><div><h3>计算结果</h3><p>{{ source }}</p></div><span class="badge">{{ matrix ? '相关性分析' : grouped ? '分组统计' : '描述统计' }}</span></div>
    <template v-if="!matrix && !grouped">
      <div class="result-metrics">
        <div><span>字段总数</span><strong>{{ format(fields.length, 0) }}</strong></div>
        <div><span>数值字段</span><strong>{{ format(numeric.length, 0) }}</strong></div>
        <div><span>重复行数</span><strong>{{ format(result.duplicates, 0) }}</strong></div>
      </div>
      <div class="tabs"><button class="tab" :class="{active:tab==='statistics'}" @click="tab='statistics'">数值统计</button><button class="tab" :class="{active:tab==='fields'}" @click="tab='fields'">字段概况</button></div>
      <div v-if="tab==='statistics' && !numeric.length" class="empty">当前数据中没有可统计的数值字段。</div>
      <div v-else-if="tab==='statistics'" class="table-wrap result-table"><table class="data-table"><thead><tr><th>字段名称</th><th v-for="(label,key) in labels" :key="key">{{ label }}</th></tr></thead><tbody><tr v-for="[name,stats] in numeric" :key="name"><th scope="row">{{ name }}</th><td v-for="(_,key) in labels" :key="key">{{ format(stats[key], key==='count' ? 0 : 4) }}</td></tr></tbody></table></div>
      <div v-else class="table-wrap result-table"><table class="data-table"><thead><tr><th>字段名称</th><th>数据类型</th><th>缺失数量</th><th>缺失率</th><th>不同值数量</th><th>最小值</th><th>最大值</th></tr></thead><tbody><tr v-for="field in fields" :key="field.name"><th scope="row">{{ field.name }}</th><td>{{ ({number:'数值',text:'文本',date:'日期'} as Record<string,string>)[field.type] || field.type }}</td><td>{{ format(field.missing,0) }}</td><td>{{ field.missingRate == null ? '—' : `${format(field.missingRate,2)}%` }}</td><td>{{ format(field.unique,0) }}</td><td>{{ format(field.min) }}</td><td>{{ format(field.max) }}</td></tr></tbody></table></div>
      <p class="result-caption">数值最多显示 4 位小数，计算保留原始精度。标准差采用样本标准差；“—”表示缺失、不适用或无法计算。</p>
    </template>
    <template v-else-if="grouped">
      <p class="result-caption">按“{{ result.metadata?.dimension || '分组字段' }}”分组 · {{ aggregates[result.metadata?.aggregate] || '统计值' }} · 显示 {{ result.categories.length }} 项</p>
      <div v-if="!result.categories.length" class="empty">当前条件下没有分组结果。</div>
      <div v-else class="table-wrap result-table"><table class="data-table"><thead><tr><th>分组</th><th>{{ aggregates[result.metadata?.aggregate] || '统计值' }}{{ result.metadata?.aggregate !== 'count' && result.metadata?.metric ? ` · ${result.metadata.metric}` : '' }}</th></tr></thead><tbody><tr v-for="(category,index) in result.categories" :key="index"><th scope="row">{{ category }}</th><td>{{ format(result.series[index]) }}</td></tr></tbody></table></div>
      <p class="result-caption">这里展示分组聚合结果，显示项数不代表全部分组。</p>
    </template>
    <template v-else>
      <p class="result-caption">Pearson 相关系数，范围 −1 至 +1。粉色表示正相关，蓝色表示负相关；颜色越深，相关程度越强。灰色对角线表示字段与自身的相关系数 1。相关关系不代表因果关系。</p>
      <div class="correlation-legend" aria-label="相关系数颜色图例"><span>−1 负相关</span><i class="negative"></i><span>0</span><i class="positive"></i><span>+1 正相关</span></div>
      <div class="table-wrap result-table"><table class="data-table"><thead><tr><th>字段</th><th v-for="field in result.fields" :key="field">{{ field }}</th></tr></thead><tbody><tr v-for="(row,index) in result.matrix" :key="index"><th scope="row">{{ result.fields[index] }}</th><td v-for="(value,column) in row" :key="column" :style="heat(value,index,column)">{{ format(value,3) }}</td></tr></tbody></table></div>
      <p class="result-caption">常量字段或有效样本不足时无法计算，显示为“—”。</p>
    </template>
    <details class="result-raw"><summary>展开计算详情</summary><div class="detail-table-wrap"><table class="detail-table"><thead><tr><th>数据项</th><th>结果</th></tr></thead><tbody><tr v-for="(row,index) in detailRows" :key="index"><th scope="row">{{ row.name }}</th><td>{{ row.value }}</td></tr></tbody></table></div></details>
  </section>
</template>

<style scoped>
.result-panel{min-width:0}.result-heading{display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:20px}.result-heading h3{margin:0;font-size:16px;color:#293a52}.result-heading p{margin:7px 0 0;color:#456398;font-size:12px}.result-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:20px}.result-metrics>div{border:1px solid #eadfe2;background:#fff9f5;border-radius:10px;padding:15px}.result-metrics span{display:block;color:#456398;font-size:12px}.result-metrics strong{display:block;font-size:24px;color:#293a52;margin-top:8px;font-variant-numeric:tabular-nums}.result-table{max-height:480px;border:1px solid #eadfe2;border-radius:9px}.result-table thead th{position:sticky;top:0;z-index:1}.result-table tbody th{background:#fff;color:#536781;font-weight:600;border-bottom:1px solid #f0f2f6}.result-table td{text-align:right;font-variant-numeric:tabular-nums}.result-caption{font-size:12px;color:#456398;line-height:1.8;margin:12px 0}.result-raw{margin-top:18px;border-top:1px solid #fcf6f3;padding-top:14px;font-size:12px;color:#456398}.result-raw summary{cursor:pointer;width:fit-content}.result-raw pre{max-height:320px;overflow:auto;padding:16px;border-radius:8px;background:#f7f9fc;line-height:1.7;font:12px/1.7 Consolas,monospace;color:#536781;tab-size:2}@media(max-width:600px){.result-metrics{gap:6px}.result-metrics>div{padding:10px}.result-metrics strong{font-size:20px}}
.result-table table{border-collapse:separate;border-spacing:0;width:100%}
.result-table{max-height:none;overflow:visible}
.result-table thead th{position:static;background:#f1f5f9!important;box-shadow:0 1px 0 #e2e8f0}
.result-table th,.result-table td{text-align:center!important;vertical-align:middle}
.result-table tbody th{position:static;background:#fff!important}
.result-table tbody td{background-clip:padding-box}
.result-raw[open] summary{margin-bottom:12px}
.detail-table-wrap{max-height:360px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
.detail-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.detail-table th,.detail-table td{padding:11px 14px;border-bottom:1px solid #edf0f4;text-align:left;vertical-align:top}
.detail-table thead th{position:sticky;top:0;background:#f1f5f9;z-index:1;color:#456398}
.detail-table tbody th{width:38%;background:#fff9f5;color:#536781;font-weight:600}
.detail-table tbody td{color:#293a52;overflow-wrap:anywhere}
.correlation-legend{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:-2px 0 10px;color:#6b7e93;font-size:11px}
.correlation-legend i{display:inline-block;width:58px;height:9px;border-radius:99px}
.correlation-legend .negative{background:linear-gradient(90deg,rgba(91,127,185,.56),#f8fafc)}
.correlation-legend .positive{background:linear-gradient(90deg,#f8fafc,rgba(225,130,157,.56))}
@media(max-width:600px){.detail-table th,.detail-table td{padding:9px 10px}.correlation-legend{justify-content:flex-start}}
</style>
