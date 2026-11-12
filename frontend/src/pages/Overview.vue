<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { serviceStatus } from '../serviceStatus';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import AppIcon from '../components/AppIcon.vue';
const ws = useWorkspace(),  
  router = useRouter();
const stats = ref<any>(null),  
  health = ref<any>(null),  
  newName = ref(''),   
  error = ref(''),   
  creating = ref(false),  
  showCreate = ref(false);  

 
const currentProject = computed(() => ws.projects.find((p) => p.id === ws.projectId)?.name || '尚未选择项目');
 
const metrics = computed(() => [
  { label: '数据集', value: stats.value?.datasets, path: '/datasets' },
  { label: '分析任务', value: stats.value?.tasks, path: '/tasks' },
  { label: '可视化图表', value: stats.value?.charts, path: '/studio' },
  { label: '分析报告', value: stats.value?.reports, path: '/reports' },
]);
 
const shortcuts = [
  { title: '探索数据', description: '查看分布、分组与相关性', path: '/analysis', icon: '01' },
  { title: '创建可视化', description: '选择字段，配置分析图表', path: '/studio', icon: '02' },
  { title: '智能分析', description: '提出问题，获取数据解读', path: '/assistant', icon: '03' },
];

 
async function load() {
  error.value = '';
  try {
     
    const [s, h] = await Promise.all([api('get', '/dashboard'), api('get', '/health')]);
    stats.value = s;  
    health.value = h;  
  } catch (e) {
    error.value = messageOf(e);
  }
}

 
async function create() {
   
  if (!newName.value.trim() || creating.value) return; 
  creating.value = true;   
  try {
     
    const p = await api<any>('post', '/projects', { name: newName.value.trim(), description: '' });
    ws.projects.push(p);  
    ws.projectId = p.id;  
    newName.value = '';  
    showCreate.value = false;  
    await load();  
  } catch (e) {
    error.value = messageOf(e);  
  } finally {
    creating.value = false;  
  }
}

 
function openDataset(dataset: any) {
  ws.projectId = dataset.projectId;  
  ws.datasetId = dataset.id;  
  router.push(`/datasets/${dataset.id}`);  
}

 
const count = (value?: number) => (value == null ? '—' : value.toLocaleString('zh-CN'));
 
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
 
onMounted(load);
</script>

<template>
  <div class="overview">
    <div v-if="error" class="error" role="alert">
      {{ error }} <button class="button ghost" @click="load">重试</button>
    </div>

     
    <section class="welcome-panel">
      <div class="welcome-copy">
        <span class="eyebrow">工作空间概览</span>
        <h2>从数据，开始新的发现</h2>
        <p>整理数据、探索规律，让每一次分析都有据可依。</p>
        <div class="project-chip">
          <span class="project-dot" />当前项目 <strong>{{ currentProject }}</strong>
        </div>
      </div>
      <div class="welcome-actions">
        <button class="button primary" @click="router.push('/datasets')">＋ 导入数据</button>
        <button class="button ghost" @click="showCreate = !showCreate">{{ showCreate ? '收起' : '新建项目' }}</button>
      </div>
    </section>

     
    <form v-if="showCreate" class="card create-project" @submit.prevent="create">
      <label for="project-name">新建分析项目</label>
      <input
        id="project-name"
        v-model="newName"
        class="control"
        placeholder="输入项目名称"
        maxlength="80"
        required/>
        <button class="button primary" :disabled="creating || !newName.trim()">
        {{ creating ? '创建中…' : '创建项目' }}</button>
        <button type="button" class="button ghost" @click="showCreate = false">取消</button>
    </form>
     
    <section class="metric-strip" aria-label="工作空间统计">
      <button v-for="item in metrics" :key="item.path" @click="router.push(item.path)">
        <div>
          <span>{{ item.label }}</span>
          <strong>{{ count(item.value) }}</strong>
        </div>
        <span class="metric-index"><AppIcon :name="item.path" /></span>
      </button>
    </section>

     
    <div class="overview-columns">
      <section class="card datasets-panel">
        <div class="panel-heading">
          <div>
            <h3>最近数据集</h3>
            <p>继续处理工作空间中的数据</p>
          </div>
          <button class="text-link" @click="router.push('/datasets')">管理数据集 →</button>
        </div>
        <div v-if="!stats" class="empty">正在读取数据…</div>
        <div v-else-if="!stats.recentDatasets?.length" class="empty">
          还没有数据集，导入一份数据开始分析。
          <div style="margin-top: 14px">
            <button class="button secondary" @click="router.push('/datasets')">导入数据</button>
          </div>
        </div>
         
        <div v-else class="table-wrap">
          <table class="data-table overview-table">
            <thead>
              <tr>
                <th>数据集名称</th>
                <th>数据行数</th>
                <th>版本</th>
                <th>更新时间</th>
                <th><span class="sr-label">操作</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dataset in stats.recentDatasets" :key="dataset.id">
                <td>
                  <button class="dataset-name" @click="openDataset(dataset)">
                    <span class="file-mark">▤</span>{{ dataset.name }}
                  </button>
                </td>
                <td>{{ count(dataset.rows) }}</td>
                <td>
                  <span class="version-label">V{{ dataset.version }}</span>
                </td>
                <td class="date-cell">{{ date(dataset.updatedAt || dataset.createdAt) }}</td>
                <td><button class="text-link" @click="openDataset(dataset)">打开</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

       
      <section class="card activity-panel">
        <div class="panel-heading">
          <div>
            <h3>最近任务</h3>
            <p>跟进分析与数据处理进展</p>
          </div>
          <button class="text-link" @click="router.push('/tasks')">全部任务 →</button>
        </div>
        <div v-if="!stats" class="empty">正在读取任务…</div>
        <div v-else-if="!stats.recentTasks?.length" class="empty">暂无任务记录，选择数据集后即可开始分析。</div>
        <div v-for="task in stats?.recentTasks || []" :key="task.id" class="activity-row">
          <span class="activity-dot" :class="task.status" />
          <div>
            <strong>{{ serviceStatus(task.type) }}</strong>
            <span>{{ date(task.updatedAt || task.createdAt) }}</span>
          </div>
          <span class="badge" :class="task.status === 'completed' ? 'green' : 'orange'">{{
            serviceStatus(task.status)
          }}</span>
        </div>
      </section>

       
      <section class="card shortcuts-panel">
        <div class="panel-heading">
          <div>
            <h3>开始分析</h3>
            <p>选择你接下来要做的事</p>
          </div>
        </div>
        <button v-for="item in shortcuts" :key="item.path" class="shortcut" @click="router.push(item.path)">
          <span class="shortcut-number">{{ item.icon }}</span
          ><span
            ><strong>{{ item.title }}</strong
            ><small>{{ item.description }}</small></span
          ><span class="shortcut-arrow">↗</span>
        </button>
      </section>

          
      <section class="card status-panel">
        <div class="panel-heading">
          <div>
            <h3>服务状态</h3>
            <p>当前工作环境</p>
          </div>
          <button class="text-link" title="刷新状态" aria-label="刷新状态" @click="load">↻</button>
        </div>
        <div
          v-for="(label, key) in {
            express: '工作台服务',
            fastapi: '数据分析',
            database: '数据存储',
            model: '智能解读',
          }"
          :key="key"
          class="status-row"
        >
          <span>{{ label }}</span>
          <span class="status-value">
            <i
              :class="
                health?.[key] === 'offline' ? 'unavailable' : health?.[key] === 'online' ? 'available' : 'neutral'
              "/>{{ serviceStatus(health?.[key]) }}
          </span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.overview {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.welcome-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 30px;
  border: 1px solid #eadfe2;
  border-radius: 16px;
  background: linear-gradient(110deg, #fcf6f3 0%, #fff9f5 65%, #fff 100%);
}
.eyebrow {
  font-size: 11px;
  color: #456398;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.welcome-copy h2 {
  font-size: 25px;
  color: #293a52;
  margin: 10px 0;
  letter-spacing: -0.025em;
}
.welcome-copy > p {
  font-size: 12px;
  color: #456398;
  margin: 0;
  line-height: 1.8;
}
.project-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 19px;
  color: #456398;
  font-size: 11px;
}
.project-chip strong {
  font-weight: 600;
  color: #536781;
}
.project-dot {
  width: 6px;
  height: 6px;
  background: #71829a;
  border-radius: 50%;
}
.welcome-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.create-project {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}
.create-project label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.create-project input {
  max-width: 400px;
  min-width: 0;
}
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid #eadfe2;
  border-radius: 13px;
  background: #fff;
  padding: 18px 0;
}
.metric-strip > button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  border: 0;
  border-right: 1px solid #fcf6f3;
  background: none;
  padding: 0 24px;
  color: #456398;
}
.metric-strip > button:last-child {
  border: 0;
}
.metric-strip > button:hover strong {
  color: #456398;
}
.metric-strip button div > span {
  display: block;
  font-size: 12px;
}
.metric-strip strong {
  display: block;
  font-size: 27px;
  font-weight: 650;
  color: #293a52;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
}
.metric-index {
  font-size: 12px;
  color: #71829a;
  background: #f4f6fc;
  border-radius: 8px;
  padding: 8px;
}
.overview-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 20px;
  align-items: start;
}
.main-column,
.side-column {
  display: grid;
  gap: 20px;
  min-width: 0;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px;
}
.panel-heading h3 {
  font-size: 14px;
  color: #293a52;
  margin: 0;
}
.panel-heading p {
  font-size: 11px;
  color: #71829a;
  margin: 6px 0 0;
}
.text-link {
  border: 0;
  background: none;
  font-size: 11px;
  color: #456398;
  white-space: nowrap;
  padding: 4px;
}
.text-link:hover {
  color: #536781;
}
.overview-table th {
  font-size: 11px;
}
.overview-table td {
  font-size: 12px;
  padding-top: 15px;
  padding-bottom: 15px;
}
.dataset-name {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 280px;
  border: 0;
  background: none;
  color: #536781;
  font-weight: 600;
  font-size: 12px;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: normal;
}
.dataset-name:hover {
  color: #456398;
}
.file-mark {
  display: grid;
  place-items: center;
  width: 29px;
  height: 33px;
  flex-shrink: 0;
  background: #fcf6f3;
  color: #71829a;
  border-radius: 6px;
  font-size: 18px;
}
.version-label {
  display: inline-block;
  background: #f4f6fb;
  color: #456398;
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 10px;
}
.date-cell {
  color: #71829a !important;
  font-size: 11px !important;
}
.sr-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
.shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 24px);
  margin: 0 12px 8px;
  padding: 12px 10px;
  border: 0;
  background: #fff;
  border-radius: 9px;
  text-align: left;
}
.shortcut:last-child {
  margin-bottom: 14px;
}
.shortcut:hover {
  background: #fcf6f3;
}
.shortcut-number {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  background: #fcf6f3;
  color: #71829a;
  font-size: 11px;
  border-radius: 9px;
}
.shortcut strong,
.shortcut small {
  display: block;
}
.shortcut strong {
  color: #536781;
  font-size: 12px;
}
.shortcut small {
  color: #71829a;
  font-size: 10px;
  margin-top: 5px;
  line-height: 1.6;
}
.shortcut-arrow {
  margin-left: auto;
  color: #71829a;
}
.status-panel {
  padding-bottom: 12px;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 22px;
  font-size: 11px;
  color: #456398;
}
.status-value {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #536781;
  font-size: 10px;
}
.status-value i,
.activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.available,
.activity-dot.completed {
  background: #6f9b8b;
}
.unavailable,
.activity-dot.failed {
  background: #d87575;
}
.neutral {
  background: #71829a;
}
.activity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 22px;
  border-top: 1px solid #f0f3f8;
}
.activity-row > div {
  flex: 1;
}
.activity-row strong {
  display: block;
  color: #536781;
  font-size: 12px;
  font-weight: 500;
}
.activity-row div > span {
  display: block;
  color: #71829a;
  font-size: 10px;
  margin-top: 5px;
}
.activity-dot {
  background: #71829a;
}
@media (min-width: 1450px) {
  .overview-columns {
    grid-template-columns: minmax(0, 1fr) 330px;
  }
}
@media (max-width: 1050px) {
  .overview-columns {
    grid-template-columns: minmax(0, 1fr);
  }
  .side-column {
    grid-template-columns: 1fr 1fr;
  }
  .metric-strip > button {
    padding: 0 17px;
  }
  .welcome-panel {
    padding: 24px;
  }
  .welcome-copy h2 {
    font-size: 22px;
  }
}
@media (max-width: 650px) {
  .welcome-panel {
    align-items: start;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
  .welcome-copy h2 {
    font-size: 21px;
  }
  .welcome-actions {
    width: 100%;
  }
  .welcome-actions > button {
    flex: 1;
  }
  .metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 0;
  }
  .metric-strip > button:nth-child(2) {
    border-right: 0;
  }
  .metric-strip strong {
    font-size: 23px;
  }
  .side-column {
    grid-template-columns: 1fr;
  }
  .create-project {
    flex-wrap: wrap;
  }
  .create-project label {
    width: 100%;
  }
  .create-project input {
    flex: 1;
    max-width: none;
  }
  .panel-heading {
    padding: 17px;
  }
  .dataset-name {
    max-width: 190px;
  }
}
.welcome-panel {
  background: linear-gradient(115deg, #fbefea 0%, #f6f5f7 62%, #fce9e7 100%);
}
.metric-strip > button:nth-child(2n) .metric-index {
  background: #fce9e7;
  color: #ad607d;
}
.file-mark {
  background: #eaf1f6;
  color: #456398;
}
.shortcut:nth-child(2n) .shortcut-number {
  background: #f3e7ed;
  color: #ad607d;
}
.overview {
  gap: 24px;
}
.welcome-panel {
  position: relative;
  overflow: hidden;
  padding: 34px;
  border-radius: 18px;
  border-color: #dfe5ed;
  background:
    radial-gradient(ellipse at 90% 20%, #fadadd60, transparent 55%), linear-gradient(110deg, #eaf0f6, #faf8fa);
  box-shadow: inset 0 1px 0 #fff;
}
.welcome-copy h2 {
  font-size: 29px;
  letter-spacing: -0.04em;
  margin: 12px 0;
}
.eyebrow {
  font-size: 12px;
}
.welcome-copy > p {
  font-size: 13px;
  color: #6b7e93;
}
.project-chip {
  background: #ffffff90;
  border: 1px solid #ffffffc0;
  padding: 8px 12px;
  border-radius: 8px;
  width: fit-content;
  font-size: 12px;
}
.metric-strip {
  box-shadow: 0 4px 20px #34485b05;
  border-color: #e5e9ef;
  padding: 23px 0;
}
.metric-strip strong {
  font-size: 32px;
  letter-spacing: -0.04em;
  margin-top: 9px;
}
.metric-strip button div > span {
  font-size: 12px;
  color: #76869a;
}
.metric-index {
  display: grid;
  place-items: center;
  padding: 13px;
  border-radius: 13px;
  background: #eaf0f6;
  color: #456398;
}
.metric-index svg {
  width: 22px;
  height: 22px;
}
.panel-heading {
  padding: 22px 24px;
}
.panel-heading h3 {
  font-size: 15px;
  letter-spacing: -0.02em;
}
.panel-heading p {
  font-size: 12px;
  color: #7c8ca0;
}
.text-link {
  font-size: 12px;
}
.shortcut {
  padding: 16px 12px;
  gap: 13px;
}
.shortcut-number {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 12px;
}
.shortcut strong {
  font-size: 13px;
}
.shortcut small {
  font-size: 11px;
  color: #7c8ca0;
}
.status-row {
  padding: 12px 24px;
  font-size: 12px;
}
.status-value {
  font-size: 11px;
}
.activity-row {
  padding: 16px 24px;
}
.activity-row div > span {
  font-size: 11px;
}
.activity-row strong {
  font-size: 13px;
}
.file-mark {
  border: 1px solid #dce5ee;
}
@media (max-width: 650px) {
  .welcome-panel {
    padding: 23px;
  }
  .welcome-copy h2 {
    font-size: 24px;
  }
  .metric-strip strong {
    font-size: 27px;
  }
  .metric-index {
    padding: 9px;
  }
  .overview {
    gap: 18px;
  }
  .panel-heading {
    padding: 18px;
  }
}
</style>
