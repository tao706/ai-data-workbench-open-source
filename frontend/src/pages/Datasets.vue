<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { ElPagination, ElTable, ElTableColumn } from 'element-plus'; 
import { api, messageOf, uploadDataset } from '../api';
import { useWorkspace } from '../store';   
import type { Dataset } from '../types'; 
import ActionDialog from '../components/ActionDialog.vue';  

const ws = useWorkspace(),  
  router = useRouter();

const items = ref<Dataset[]>([]),  
  search = ref(''),  
  page = ref(1),  
  drag = ref(false),  
  progress = ref(0),  
  busy = ref(false),  
  listLoading = ref(false),  
  error = ref(''),  
  notice = ref('');  
 
const fileInput = ref<HTMLInputElement>();
 
const dialog = ref<{ kind: 'rename' | 'delete'; dataset: Dataset } | null>(null),
  dialogBusy = ref(false);  
const pageSize = 10;  
let abort: AbortController | undefined;  
let listSequence = 0;  

 
const filtered = computed(() =>
  items.value.filter((d) => d.name.toLowerCase().includes(search.value.trim().toLowerCase())),
);

 
const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));

 
watch(search, () => (page.value = 1));

 
watch(
  () => ws.projectId,  
  () => {
    page.value = 1;
    load();  
  },
);

 
watch(filtered, (rows) => {
  if (page.value > Math.max(1, Math.ceil(rows.length / pageSize)))
    page.value = Math.max(1, Math.ceil(rows.length / pageSize));
});

 
async function load() {
  const sequence = ++listSequence,  
    projectId = ws.projectId;  
  items.value = [];  
  if (!projectId) {
     
    listLoading.value = false;
    return;
  }
  listLoading.value = true;  
  error.value = '';
  try {
     
    const data = await api<Dataset[]>('get', `/datasets?projectId=${projectId}`);
     
    if (sequence === listSequence) items.value = data;
  } catch (e) {
    if (sequence === listSequence) error.value = messageOf(e);
  } finally {
    if (sequence === listSequence) listLoading.value = false;  
  }
}

 
async function receive(file?: File) {
  if (!file || busy.value) return;  
  if (!ws.projectId) {
    error.value = '请先在总览页创建项目';
    return;
  }
  if (!file.size) {
    error.value = '文件为空，请选择包含数据的 CSV 或 XLSX 文件。';
    return;
  }
   
  if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 30 * 1024 * 1024) {
    error.value = '仅支持 30 MB 以内的 CSV、XLSX';
    return;
  }
  busy.value = true;  
  progress.value = 0;  
  error.value = '';
  notice.value = '';
  abort = new AbortController();  
  try {
     
    const d = await uploadDataset(ws.projectId, file, (n) => (progress.value = n), abort.signal);
    ws.datasetId = d.id;  
    notice.value = `${d.name} 上传并解析成功`;
    await load();  
  } catch (e) {
     
    if (axios.isCancel(e)) notice.value = '已停止等待上传结果。若文件已传完，请刷新列表确认是否导入成功。';
    else error.value = messageOf(e);
  } finally {
    busy.value = false;  
    abort = undefined;  
     
    if (fileInput.value) fileInput.value.value = '';
  }
}

 
async function sample() {
  if (!ws.projectId) {
    error.value = '请先创建项目';
    return;
  }
  busy.value = true;
  try {
     
    const d = await api<Dataset>('post', '/datasets/sample', { projectId: ws.projectId });
    ws.datasetId = d.id;
    notice.value = '示例数据已导入';
    await load();
  } catch (e) {
    error.value = messageOf(e);
  } finally {
    busy.value = false;
  }

}

 
async function confirmDialog(name: string) {
  const current = dialog.value;  
  if (!current || dialogBusy.value) return;  
  dialogBusy.value = true;  
  error.value = '';
  try {
    if (current.kind === 'rename') {
      if (!name.trim()) return;  
       
      await api('patch', `/datasets/${current.dataset.id}`, { name: name.trim() });
      notice.value = '数据集名称已更新';
    } else {
       
      await api('delete', `/datasets/${current.dataset.id}`);
       
       
      if (ws.datasetId === current.dataset.id) ws.datasetId = '';
      notice.value = '数据集已删除';
    }
    dialog.value = null;  
    await load(); 
  } catch (e) {
    error.value = messageOf(e);
  } finally {
    dialogBusy.value = false;  
  }
}

 
function openDataset(d: Dataset) {
  ws.datasetId = d.id;
  router.push(`/datasets/${d.id}`);
}
onMounted(load);  
</script>

<template>
  <div class="stack">
    <div class="page-heading">
      <div>
        <h2>数据集管理</h2>
        <p>导入、检查和管理分析所需的数据。</p>
      </div>
      <button class="button secondary" :disabled="busy" @click="sample">＋ 导入示例数据</button>
    </div>
    <div v-if="error" class="error" role="alert">
      {{ error }} <button v-if="ws.projectId && !busy" class="button ghost" @click="load">重试加载</button>
    </div>
    <div v-if="notice" class="success">{{ notice }}</div>
     
    <div class="card card-pad">
       
      <div
        class="drop-zone"
        :class="{ drag }"
        @dragover.prevent="drag = true" 
        @dragleave.prevent="drag = false"
        @drop.prevent="
          drag = false;
          receive($event.dataTransfer?.files[0]);
        "
        @click="fileInput?.click()"
      >
        <div style="font-size: 30px; color: #8cb3d9; margin-bottom: 7px">⇧</div>
        <strong>拖拽文件到这里，或点击选择</strong>支持 CSV / XLSX，单文件最大 30 MB
         
        <input
          ref="fileInput"
          hidden
          type="file"
          accept=".csv,.xlsx"
          @change="receive(($event.target as HTMLInputElement).files?.[0])"
        />
      </div>

       
      <div v-if="busy" style="margin-top: 14px">
        <div class="select-line small">
          <span style="flex: 1">{{ progress === 100 ? '正在解析数据…' : '正在上传…' }}</span>
          <button class="button ghost" @click.stop="abort?.abort()">取消</button>
        </div>
        <div class="progress-track"><div class="progress-fill" :style="{ width: progress + '%' }"></div></div>
      </div>
    </div>

     
    <div class="card card-pad">
      <div class="page-heading" style="margin-bottom: 15px">
        <h3 class="card-title" style="margin: 0">
          全部数据集 <span class="muted">{{ filtered.length }}</span>
        </h3>
        <input v-model="search" class="control search" placeholder="搜索数据集名称" />
      </div>
       
        
      <ElTable
        :data="pageRows"
        :loading="listLoading"
        stripe
        table-layout="auto"
        :empty-text="!ws.projectId ? '请先创建或选择项目' : error ? '数据集加载失败，请重试' : '当前项目还没有数据集'"
        style="width: 100%"
      >
        <ElTableColumn label="名称" min-width="220">
          <template #default="{ row }">
            <button class="dataset-link" @click="openDataset(row as Dataset)">{{ row.name }}</button>
          </template>
        </ElTableColumn>
        <ElTableColumn label="行数" min-width="85">
          <template #default="{ row }">{{ row.rows.toLocaleString() }}</template>
        </ElTableColumn>
        <ElTableColumn prop="columns" label="字段数" min-width="90" />
        <ElTableColumn label="版本" min-width="80">
          <template #default="{ row }"><span class="badge">V{{ row.version }}</span></template>
        </ElTableColumn>
        <ElTableColumn label="上传时间" min-width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </ElTableColumn>
         
        <ElTableColumn label="操作" min-width="190">
          <template #default="{ row }">
            <div class="row-actions">
              <button class="button ghost" @click="dialog = { kind: 'rename', dataset: row as Dataset }">重命名</button>
              <button class="button danger" @click="dialog = { kind: 'delete', dataset: row as Dataset }">删除</button>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>
       
      <ElPagination
        v-if="filtered.length > pageSize"
        :current-page="page"
        :page-size="pageSize"
        :total="filtered.length"
        layout="prev, pager, next, total"
        background
        @current-change="page = $event"
      />
    </div>
     
    <ActionDialog
      :open="!!dialog"
      :title="dialog?.kind === 'rename' ? '重命名数据集' : '删除数据集'"
      :description="
        dialog?.kind === 'rename'
          ? '为数据集输入一个清晰、易识别的名称。'
          : `确定删除「${dialog?.dataset.name || ''}」？此操作会移除相关数据版本。`
      "
      :input-label="dialog?.kind === 'rename' ? '数据集名称' : undefined"
      :initial-value="dialog?.kind === 'rename' ? dialog.dataset.name : ''"
      :confirm-label="dialog?.kind === 'rename' ? '保存名称' : '确认删除'"
      :danger="dialog?.kind === 'delete'"
      :busy="dialogBusy"
      @cancel="dialog = null"
      @confirm="confirmDialog"
    />
  </div>
</template>

<style scoped>
.dataset-link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 8px 12px;
  margin: -8px -12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #456398;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  transition: background-color .18s ease, color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.dataset-link:hover {
  background: #fadadd66;
  color: #96506f;
  box-shadow: inset 3px 0 0 #e1829d;
  transform: translateX(2px);
  text-decoration: none;
}
.dataset-link:focus-visible {
  outline: 2px solid #8cb3d9;
  outline-offset: 3px;
  background: #bfd7ea55;
}
.dataset-link:active {
  background: #f4a7b955;
  transform: translateX(2px) scale(.98);
}
.row-actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}
.row-actions .button {
  padding: 7px 10px;
}
</style>
