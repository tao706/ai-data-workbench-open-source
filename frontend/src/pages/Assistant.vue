<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api, messageOf, streamAi } from '../api';
import { useWorkspace } from '../store';
import AnalysisResult from '../components/AnalysisResult.vue';
import type { Dataset } from '../types';
const ws=useWorkspace(), d=ref<Dataset>(), question=ref(''), plan=ref<any>(), answer=ref(''), stage=ref(''), progress=ref(0), busy=ref(false), error=ref(''), result=ref<any>(), resultSource=ref(''), modelMode=ref<'model'|'demo'|''>('');
const planLabels: Record<string,string> = {descriptive:'描述统计', groupby:'分组聚合', correlation:'相关性分析'};
let controller:AbortController|undefined;
async function load(){if(ws.datasetId)try{d.value=await api('get',`/datasets/${ws.datasetId}`)}catch(e){error.value=messageOf(e)}}
async function makePlan(){if(!d.value||busy.value)return;error.value='';answer.value='';result.value=undefined;try{plan.value=await api('post','/ai/plan',{datasetId:d.value.id,question:question.value})}catch(e){error.value=messageOf(e)}}
async function run(){
  if(!plan.value||!d.value||busy.value)return;
  controller=new AbortController();busy.value=true;answer.value='';result.value=undefined;error.value='';progress.value=0;modelMode.value='';
  const source=`${d.value.name} · 版本 ${d.value.version} · ${d.value.rows.toLocaleString('zh-CN')} 行`;
  try{await streamAi({datasetId:d.value.id,question:question.value,plan:plan.value},(event,data)=>{
    if(event==='meta')modelMode.value=data.model==='langchain'?'model':'demo';
    if(event==='progress'){stage.value=data.stage;progress.value=data.progress}
    if(event==='token')answer.value+=data.text;
    if(event==='done'){progress.value=100;result.value=data.result;resultSource.value=source;stage.value='分析完成'}
    if(event==='error'){error.value=data.message;stage.value='分析失败'}
  },controller.signal)}catch(e){if(!controller.signal.aborted){error.value=messageOf(e);stage.value='分析失败'}}finally{busy.value=false}
}
function stop(){controller?.abort();stage.value='已停止生成';busy.value=false}
async function copy(){try{await navigator.clipboard.writeText(answer.value)}catch{error.value='复制失败，请手动选择内容复制'}}
onMounted(load);onBeforeUnmount(stop);
</script>

<template>
  <div class="stack">
    <div class="page-heading"><div><h2>AI 分析助手</h2><p>确认分析计划，获取数据解读与可核对的统计结果。</p></div></div>
    <div v-if="error" class="error" role="alert">{{error}}</div>
    <div v-if="!d" class="card empty">请先选择一个数据集</div>
    <template v-else>
      <div class="grid-2 assistant-input">
        <div class="card card-pad stack">
          <div><h3 class="card-title">向数据提问</h3><p class="muted small">{{d.name}} · {{d.rows.toLocaleString('zh-CN')}} 行</p></div>
          <label class="field">分析问题<textarea v-model="question" :disabled="busy" placeholder="请输入你想分析的问题，例如：哪个类别的指标最高？" /></label>
          <div class="pill-row"><button v-for="x in ['这份数据有哪些主要特征？','按区域对比销售额','数值字段之间有相关性吗？']" :key="x" class="button ghost" :disabled="busy" @click="question=x">{{x}}</button></div>
          <button class="button primary" :disabled="busy||question.trim().length<2" @click="makePlan">生成分析计划</button>
          <div v-if="plan" class="plan-panel"><span class="muted small">待确认的分析计划</span><h3>{{plan.title}}</h3><div class="pill-row"><span class="pill">{{planLabels[plan.type] || '数据分析'}}</span><span v-if="plan.dimension" class="pill">分组：{{plan.dimension}}</span><span v-if="plan.metric" class="pill">指标：{{plan.metric}}</span></div><button v-if="!busy" class="button primary" @click="run">确认并执行</button><button v-else class="button danger" @click="stop">停止生成</button></div>
        </div>
        <div class="card card-pad"><h3 class="card-title">分析进度</h3><div class="progress-track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" :style="{width:progress+'%'}" /></div><p class="muted small">{{stage||'等待确认分析计划'}}</p><ol class="analysis-steps"><li>确认分析范围与计算方式</li><li>读取数据并执行统计计算</li><li>生成分析解读与结果明细</li></ol></div>
      </div>
      <div v-if="answer" class="card card-pad"><div class="page-heading"><h3 class="card-title" style="margin:0">分析解读 <span class="badge">{{modelMode==='model'?'模型解读':'演示解读'}}</span></h3><button class="button ghost" @click="copy">复制解读</button></div><div class="ai-message">{{answer}}</div><p class="muted small">{{resultSource || `${d.name} · 版本 ${d.version}`}}</p></div>
      <AnalysisResult v-if="result" :result="result" :source="resultSource" />
    </template>
  </div>
</template>

<style scoped>
.assistant-input{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)}.plan-panel{background:#fff9f5;border:1px solid #eadfe2;border-radius:10px;padding:16px}.plan-panel h3{font-size:14px;margin:8px 0 12px}.plan-panel>.button{margin-top:16px}.analysis-steps{padding-left:22px;margin-top:26px;color:#456398;font-size:13px;line-height:2.8}@media(max-width:760px){.assistant-input{grid-template-columns:1fr}}
</style>
