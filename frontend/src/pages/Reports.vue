<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { ElForm, ElFormItem, ElInput } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import ChartView from '../components/ChartView.vue';
import type { Report, SavedChart } from '../types';

const ws=useWorkspace(),reports=ref<Report[]>([]),charts=ref<SavedChart[]>([]),selected=ref<string[]>([]),error=ref(''),notice=ref('');
const form=reactive({title:'数据分析报告',content:''});
const formRef=ref<FormInstance>(),saving=ref(false);
const rules:FormRules={title:[{required:true,whitespace:true,message:'请输入报告标题',trigger:'blur'},{max:100,message:'标题不能超过 100 个字符',trigger:'blur'}],content:[{required:true,whitespace:true,message:'请填写分析摘要后再保存',trigger:'blur'}]};
const chartResults=ref<Record<string,any>>({});
async function loadChartResults(){for(const id of selected.value){const item=charts.value.find(c=>c.id===id);if(!item||chartResults.value[id])continue;try{const c=item.config;chartResults.value[id]=await api('post','/charts/data',{datasetId:item.datasetId,version:item.datasetVersion,chartType:c.chartType,dimension:c.dimension,metric:c.metric||undefined,aggregate:c.aggregate,limit:c.limit,filterField:c.filterField||undefined,filterValue:c.filterValue||undefined,sort:c.sort||'desc'})}catch(e){error.value=messageOf(e)}}}
function printReport(){window.print()}
async function load(){if(!ws.projectId)return;try{reports.value=await api('get',`/reports?projectId=${ws.projectId}`);charts.value=await api('get',`/charts?projectId=${ws.projectId}`)}catch(e){error.value=messageOf(e)}}
async function save(){
  error.value='';notice.value='';
  if(!ws.projectId){error.value='请先创建项目';return}
  if(!await formRef.value?.validate().catch(()=>false))return;
  saving.value=true;
  try{const sections=[{type:'text',title:'分析摘要',content:form.content.trim()},...selected.value.map(id=>({type:'chart',title:charts.value.find(c=>c.id===id)?.name||'图表',chartId:id}))];await api('post','/reports',{projectId:ws.projectId,title:form.title.trim(),sections});notice.value='报告草稿已保存';await load()}
  catch(e){error.value=messageOf(e)}finally{saving.value=false}
}
function open(r:Report){chartResults.value={};form.title=r.name;const saved=r.sections.find(s=>s.type==='text')?.content||'';form.content=saved==='请填写报告摘要、主要发现和行动建议。'?'':saved;selected.value=r.sections.filter(s=>s.chartId).map(s=>s.chartId!);formRef.value?.clearValidate()}
watch(()=>ws.projectId,load);onMounted(load);watch(selected,loadChartResults,{deep:true});watch(charts,loadChartResults);
</script>

<template>
  <div class="stack">
    <div class="page-heading"><div><h2>报告中心</h2><p>组合文字与已保存图表，生成可打印的分析报告。</p></div><button class="button primary" :disabled="saving" @click="save">{{saving?'保存中…':'保存报告草稿'}}</button></div>
    <div v-if="error" class="error" role="alert">{{error}}</div><div v-if="notice" class="success">{{notice}}</div>
    <div class="split">
      <div class="card card-pad stack">
        <h3 class="card-title">编辑报告</h3>
        <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" class="report-form">
          <ElFormItem label="报告标题" prop="title"><ElInput v-model="form.title" maxlength="100"/></ElFormItem>
          <ElFormItem label="分析摘要" prop="content"><ElInput v-model="form.content" type="textarea" :rows="7" placeholder="填写报告摘要、主要发现和行动建议"/></ElFormItem>
        </ElForm>
        <div class="field">加入图表</div>
        <div v-if="!charts.length" class="muted small">先到可视化工作室保存图表</div>
        <label v-for="c in charts" :key="c.id" class="select-line small"><input v-model="selected" type="checkbox" :value="c.id"/> {{c.name}}</label>
        <h3 class="card-title" style="margin-top:14px">历史报告</h3>
        <button v-for="r in reports" :key="r.id" class="button ghost" @click="open(r)">{{r.name}}</button>
        <div v-if="!reports.length" class="muted small">暂无报告</div>
      </div>
      <div><div class="toolbar" style="justify-content:flex-end"><button class="button ghost" @click="printReport">打印 / 另存为 PDF</button></div>
        <article class="report-sheet"><div class="muted small">分析报告 · 工作空间</div><h2>{{form.title}}</h2><div class="muted small">{{new Date().toLocaleDateString()}} · 项目：{{ws.projects.find(p=>p.id===ws.projectId)?.name}}</div><h3>分析摘要</h3><p style="white-space:pre-wrap">{{form.content || '尚未填写分析摘要。'}}</p>
          <template v-for="id in selected" :key="id"><h3>{{charts.find(c=>c.id===id)?.name}}</h3><p>图表类型：{{charts.find(c=>c.id===id)?.config.chartType}} · 数据版本：V{{charts.find(c=>c.id===id)?.datasetVersion}}</p><ChartView v-if="charts.find(c=>c.id===id)&&chartResults[id]" :config="charts.find(c=>c.id===id)!.config" :data="chartResults[id]"/></template>
          <p class="muted" style="margin-top:55px;font-size:11px">本报告记录了关联的图表配置与数据版本。</p>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-form{min-width:0}.report-form :deep(.el-textarea__inner){min-height:170px!important;resize:vertical}
</style>
