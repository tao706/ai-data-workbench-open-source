<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElPagination, ElTable, ElTableColumn } from 'element-plus';
import { serviceStatus } from '../serviceStatus';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import ActionDialog from '../components/ActionDialog.vue';
import type { Task } from '../types';

const ws=useWorkspace(),tasks=ref<Task[]>([]),health=ref<Record<string,string>>(),error=ref(''),page=ref(1),loading=ref(false);
const deletingTask=ref<Task|null>(null),deleteBusy=ref(false),notice=ref('');
const deleteError=ref('');
const pageSize=10;
const pageTasks=computed(()=>tasks.value.slice((page.value-1)*pageSize,page.value*pageSize));
async function load(){tasks.value=[];if(!ws.projectId){loading.value=false;return}loading.value=true;error.value='';try{tasks.value=await api('get',`/tasks?projectId=${ws.projectId}`);health.value=await api('get','/health');page.value=Math.min(page.value,Math.max(1,Math.ceil(tasks.value.length/pageSize)))}catch(e){error.value=messageOf(e)}finally{loading.value=false}}
async function confirmDelete(){
  if(!deletingTask.value||deleteBusy.value)return;
  deleteBusy.value=true;error.value='';notice.value='';deleteError.value='';
  try{
    await api('delete',`/tasks/${deletingTask.value.id}`);
    deletingTask.value=null;
    await load();
    notice.value='任务记录已删除';
  }catch(e){deleteError.value=messageOf(e)}finally{deleteBusy.value=false}
}
watch(()=>ws.projectId,()=>{page.value=1;load()});onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-heading"><div><h2>任务与运行监控</h2><p>查看任务状态、结果和服务可用性。</p></div><button class="button ghost" :disabled="loading" @click="load">↻ 刷新</button></div>
    <div v-if="error" class="error" role="alert">{{error}}</div>
    <div v-if="notice" class="success" role="status">{{notice}}</div>
    <div class="grid-4"><div v-for="(label,key) in {express:'工作台服务',fastapi:'数据分析',database:'数据存储',model:'智能解读'}" :key="key" class="card stat-card"><div class="stat-label">{{label}}</div><div style="margin-top:21px"><span class="badge" :class="health?.[key]==='online'||health?.[key]==='configured'?'green':'orange'">{{serviceStatus(health?.[key])}}</span></div></div></div>
    <div class="card card-pad">
      <h3 class="card-title">任务记录</h3>
      <ElTable :data="pageTasks" :loading="loading" stripe table-layout="auto" empty-text="暂无分析任务" style="width:100%">
        <ElTableColumn prop="name" label="任务" min-width="170"/>
        <ElTableColumn label="类型" min-width="110"><template #default="{row}">{{serviceStatus(row.type)}}</template></ElTableColumn>
        <ElTableColumn label="状态" min-width="95"><template #default="{row}"><span class="badge" :class="row.status==='completed'?'green':'orange'">{{serviceStatus(row.status)}}</span></template></ElTableColumn>
        <ElTableColumn label="进度" min-width="75"><template #default="{row}">{{row.progress}}%</template></ElTableColumn>
        <ElTableColumn label="开始时间" min-width="180"><template #default="{row}">{{new Date(row.createdAt).toLocaleString()}}</template></ElTableColumn>
        <ElTableColumn label="错误" min-width="170"><template #default="{row}">{{row.error||'—'}}</template></ElTableColumn>
        <ElTableColumn label="操作" min-width="72" align="center">
          <template #default="{row}">
            <button
              class="task-delete-button"
              type="button"
              :disabled="row.status==='running'||deleteBusy"
              :title="row.status==='running'?'任务运行中，完成后可删除':'删除任务记录'"
              :aria-label="row.status==='running'?'任务运行中，完成后可删除':`删除任务记录：${row.name}`"
              @click="deleteError='';deletingTask=row as Task"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4.5 7h15M9.5 7V5.5c0-.8.7-1.5 1.5-1.5h2c.8 0 1.5.7 1.5 1.5V7m-8.8 0 .8 11.1c.1 1.1.9 1.9 2 1.9h7c1.1 0 1.9-.8 2-1.9L18.3 7M10 10.5v6M14 10.5v6"/>
              </svg>
            </button>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination v-if="tasks.length>pageSize" :current-page="page" :page-size="pageSize" :total="tasks.length" layout="prev, pager, next, total" background @current-change="page=$event"/>
    </div>
    <ActionDialog :open="!!deletingTask" title="删除任务记录" :description="`确定删除「${deletingTask?.name||''}」的任务记录？该任务的计算结果将无法再查看，数据集及已保存的图表、报告会保留。`" confirm-label="确认删除" danger :busy="deleteBusy" :error-message="deleteError" @cancel="deletingTask=null" @confirm="confirmDelete"/>
  </div>
</template>

<style scoped>
.task-delete-button{display:inline-grid;place-items:center;width:38px;height:38px;border:1px solid #f3d9e1;border-radius:11px;background:#fff5f7;color:#a75b76;cursor:pointer;transition:background .18s,border-color .18s,transform .18s,box-shadow .18s}
.task-delete-button svg{width:19px;height:19px}
.task-delete-button:hover:not(:disabled){background:#fce8ee;border-color:#e8b9c9;box-shadow:0 4px 12px #d77f9b26;transform:translateY(-1px)}
.task-delete-button:focus-visible{outline:2px solid #a75b76;outline-offset:2px}
.task-delete-button:disabled{opacity:.45;cursor:not-allowed}
</style>
