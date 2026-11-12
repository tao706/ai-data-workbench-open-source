<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import type { Dataset } from '../types';

const ws = useWorkspace(),  
  d = ref<Dataset>(),  
  tab = ref('descriptive'),  
  result = ref<any>(),  
  error = ref(''),  
  busy = ref(false),  
  loading = ref(false),  
  dimension = ref(''),  
  metric = ref(''),   
  aggregate = ref('sum');  

 
let loadSequence = 0,  
  runSequence = 0;  

 
async function load() {
  const sequence = ++loadSequence;  
  ++runSequence;  
  d.value = undefined;  
  result.value = undefined;  
  error.value = '';
  busy.value = false;  
   
  if (!ws.datasetId) {
    loading.value = false;
    return;
  }
  loading.value = true;  
  try { 
     
    const dataset = await api<Dataset>('get', `/datasets/${ws.datasetId}`);
    if (sequence !== loadSequence) return; 
    d.value = dataset;
     
    dimension.value = dataset.fields.find((f) => f.type !== 'number')?.name || dataset.fields[0]?.name || '';
     
    metric.value = dataset.fields.find((f) => f.type === 'number')?.name || '';
  } catch (e) {
     
    if (sequence === loadSequence) error.value = messageOf(e);
  } finally {
     
    if (sequence === loadSequence) loading.value = false;
  }
}

 
async function run() {
  if (!d.value || busy.value) return;
  const sequence = ++runSequence,  
    datasetId = d.value.id,  
    analysisType = tab.value;  
  busy.value = true;  
  error.value = '';
  result.value = undefined;  
  try {
     
    const task = await api<any>('post', '/analysis/tasks', {
      datasetId,  
      type: analysisType,  
      dimension: dimension.value,  
      metric: metric.value,  
      aggregate: aggregate.value,  
    });
     
    if (sequence === runSequence && ws.datasetId === datasetId && tab.value === analysisType)
      result.value = task.result;
  } catch (e) {
    if (sequence === runSequence) error.value = messageOf(e);
  } finally {
    if (sequence === runSequence) busy.value = false;
  }
}

 
function selectTab(next: string) {
  ++runSequence;
  busy.value = false;  
  tab.value = next;  
  result.value = undefined;  
  error.value = '';  
}

 
 
watch(() => ws.datasetId, load, { immediate: true });
</script>

<template>
  <div class="stack">
    <div class="page-heading">
      <div>
        <h2>探索性分析</h2>
        <p>查看描述统计、分组对比与相关性，形成可核对的分析依据。</p>
      </div>
      <button class="button primary" :disabled="!d || busy || loading" @click="run">
        {{ busy ? '计算中…' : '运行分析' }}
      </button>
    </div>
    <div v-if="error" class="error" role="alert">
      {{ error }}
      <button v-if="ws.datasetId && !loading" class="button ghost" @click="load">重试加载</button>
    </div>
    <div v-if="loading" class="card empty">正在加载数据集…</div>
    <div v-else-if="!d" class="card empty">{{ error ? '数据集加载失败，请重试。' : '请先选择数据集' }}</div>
    <template v-else>
      <div class="card card-pad">
        <div class="tabs">
          <button
            v-for="t in [
              ['descriptive', '描述统计'],
              ['groupby', '分组聚合'],
              ['correlation', '相关性矩阵'],
            ]"
            :key="t[0]"
            class="tab"
            :class="{ active: tab === t[0] }"
            @click="selectTab(t[0])"
          >
            {{ t[1] }}
          </button>
        </div>
        <p class="muted small">当前数据集：{{ d.name }} · {{ d.rows }} 行</p>

         
        <div v-if="tab === 'groupby'" class="grid-4">
          <label class="field">
            分组字段
            <AppSelect v-model="dimension">
              <option v-for="f in d.fields" :key="f.name" :value="f.name">{{ f.name }}</option>
            </AppSelect>
          </label>
          <label class="field">
            数值指标
            <AppSelect v-model="metric">
              <option v-for="f in d.fields.filter((x) => x.type === 'number')" :key="f.name" :value="f.name">
                {{ f.name }}
              </option>
            </AppSelect>
          </label>
          <label class="field">
            计算方式
            <AppSelect v-model="aggregate">
              <option value="count">计数</option>
              <option value="sum">求和</option>
              <option value="mean">平均值</option>
              <option value="min">最小值</option>
              <option value="max">最大值</option>
            </AppSelect>
          </label>
        </div>
      </div>

       
      <div v-if="result" class="card card-pad">
        <h3 class="card-title">分析结果</h3>
         
        <div v-if="tab === 'descriptive'">
          <div class="pill-row" style="margin-bottom: 16px">
            <span class="pill">重复行 {{ result.duplicates }}</span>
            <span class="pill">字段 {{ result.fields.length }}</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>数值字段</th>
                  <th>计数</th>
                  <th>均值</th>
                  <th>中位数</th>
                  <th>标准差</th>
                  <th>最小值</th>
                  <th>Q1</th>
                  <th>Q3</th>
                  <th>最大值</th>
                </tr>
              </thead>
              <tbody>
                 
                <tr v-for="(s, name) in result.numeric" :key="String(name)">
                  <td>{{ name }}</td>
                  <td>{{ (s as any).count }}</td>
                  <td>{{ Number((s as any).mean).toFixed(2) }}</td>
                  <td>{{ (s as any).median }}</td>
                  <td>{{ (s as any).std == null ? '—' : Number((s as any).std).toFixed(2) }}</td>
                  <td>{{ (s as any).min }}</td>
                  <td>{{ (s as any).q1 }}</td>
                  <td>{{ (s as any).q3 }}</td>
                  <td>{{ (s as any).max }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

         
        <div v-else-if="tab === 'groupby'" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ dimension }}</th>
                <th>{{ aggregate }} {{ metric }}</th>
              </tr>
            </thead>
            <tbody>
               
              <tr v-for="(x, i) in result.categories" :key="i">
                <td>{{ x }}</td>
                <td>{{ result.series[i] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

         
        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>字段</th>
                <th v-for="x in result.fields" :key="x">{{ x }}</th>
              </tr>
            </thead>
            <tbody>
               
              <tr v-for="(row, i) in result.matrix" :key="i">
                <td>{{ result.fields[i] }}</td>
                 
                <td v-for="(n, j) in row" :key="j">{{ n == null ? '—' : Number(n).toFixed(3) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
