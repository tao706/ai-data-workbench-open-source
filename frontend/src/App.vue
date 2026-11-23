<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElConfigProvider } from 'element-plus';  
import zhCn from 'element-plus/es/locale/lang/zh-cn';  
import AppIcon from './components/AppIcon.vue';  
import { useRoute, useRouter } from 'vue-router';
import { api, messageOf } from './api';
import { useAuthStore } from './auth';
import { useWorkspace } from './store';
import type { Project } from './types';
const route = useRoute();
const router = useRouter();
const ws = useWorkspace();  
const auth = useAuthStore();  
const health = ref<any>(null);  
const loading = ref(false);  
const logoutError = ref('');
const refreshError = ref('');
const refreshNotice = ref('');
const pageView = ref<{ refresh?: () => Promise<void> }>();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(noticeTimer));
const nav = [
  ['/', '◫', '总览'],
  ['/datasets', '▤', '数据集'],
  ['/clean', '⌁', '数据清洗'],
  ['/analysis', '◷', '探索分析'],
  ['/studio', '▥', '可视化工作室'],
  ['/knowledge', '▤', '业务资料'],
  ['/assistant', '✦', 'AI 分析助手'],
  ['/reports', '▣', '报告中心'],
  ['/tasks', '◴', '任务监控'],
];
 
const title = computed(() => nav.find((x) => x[0] === route.path)?.[2] || '数据集详情');

 
async function refresh(refreshPage = false) {
  if (loading.value) return;
  refreshNotice.value = '';
  clearTimeout(noticeTimer);
  let workspaceUpdated = false;
  const pagePath = route.fullPath;
  const projectId = ws.projectId;
  loading.value = true;  
  refreshError.value = '';  
  try {
    const user = await auth.loadUser();
    if (!user) return;
    ws.syncOwner(user.id);
     
     
     
    const [projects, status] = await Promise.all([api<Project[]>('get', '/projects'), api('get', '/health')]);
    ws.projects = projects;  
     
    if (!projects.some((project) => project.id === ws.projectId)) {
      ws.projectId = projects[0]?.id || '';
      ws.datasetId = '';
    }
    health.value = status;
    workspaceUpdated = true;
    if (refreshPage && route.fullPath === pagePath && ws.projectId === projectId) {
      if (projectId) ws.datasets = await api('get', `/datasets?projectId=${encodeURIComponent(projectId)}`);
      await nextTick();
      if (route.fullPath === pagePath && ws.projectId === projectId) await pageView.value?.refresh?.();
      refreshNotice.value = '当前页面数据已更新';
    } else if (refreshPage) {
      refreshNotice.value = '工作空间信息已更新';
    }
    if (refreshPage) noticeTimer = setTimeout(() => { refreshNotice.value = ''; }, 3000);  
  } catch (e) {
    if (!workspaceUpdated) health.value = null;
    refreshError.value = `刷新失败，现有信息可能不是最新的。${messageOf(e)}`;
  } finally {
    loading.value = false;  
  }
}

 
async function logout() {
  logoutError.value = '';
  try {
    await auth.logout();
    ws.projectId = '';
    ws.datasetId = '';
    ws.projects = [];
    ws.datasets = [];
    await router.replace('/login');  
  } catch (e) {
    logoutError.value = messageOf(e);
  }
}
function projectChanged() {
  if (route.path.startsWith('/datasets/')) void router.replace('/datasets');
}
onMounted(refresh);
</script>
<template>
  <ElConfigProvider :locale="zhCn">
    <router-view v-if="route.path === '/login'" @logged-in="refresh" />
    <div v-else class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-icon">◈</span>
          <div><strong>数析工作台</strong><small>AI DATA WORKBENCH</small></div>
        </div>
        <div class="nav-caption">工作空间</div>
        <nav>
          <router-link
            v-for="item in nav"
            :key="item[0]"
            :to="item[0]"
            class="nav-item"
            :class="{ active: route.path === item[0] }">
          <AppIcon :name="item[0]" /><span>{{ item[2] }}</span></router-link>
        </nav>
        <div class="sidebar-bottom">
          <div v-if="logoutError" class="error" role="alert">{{ logoutError }}</div>
          <div class="service-mini">
            <span class="status-dot" :class="health?.fastapi === 'online' ? 'online' : 'offline'"></span>
            <span>分析服务 {{ health?.fastapi === 'online' ? '运行中' : '未连接' }}</span>
          </div>
          <div class="profile">
            <span class="avatar">D</span>
            <div>
              <strong>{{ auth.user?.name || '演示用户' }}</strong>
              <small>个人工作空间</small>
            </div>
            <button class="icon-button" title="退出" @click="logout">↪</button>
          </div>
        </div>
      </aside>
      <div class="main-wrap">
        <header class="topbar">
          <div>
            <div class="breadcrumb">工作空间 / {{ title }}</div>
            <h1>{{ title }}</h1>
          </div>
          <div class="top-actions">
            <AppSelect v-model="ws.projectId" class="project-select" aria-label="当前项目" @change="projectChanged">
              <option value="">请选择项目</option>
              <option v-for="project in ws.projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option></AppSelect>
            <span v-if="refreshNotice" class="refresh-notice" role="status">{{ refreshNotice }}</span>
            <button class="icon-button workspace-refresh" :title="loading ? '正在刷新' : '刷新当前页面'" :aria-label="loading ? '正在刷新' : '刷新当前页面'" :aria-busy="loading" :disabled="loading" @click="refresh(true)">
              <svg :class="{ spinning: loading }" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.36-5.36L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 5.36L3 16M8 16H3v5"/></svg>
            </button>
            <span class="top-avatar">D</span>
          </div>
        </header>
        <main class="content">
          <div v-if="refreshError" class="error" role="alert">
            {{ refreshError }} <button class="button ghost" @click="refresh(true)">重试</button>
          </div>
          <router-view v-slot="{ Component }">
            <component :is="Component" :key="`${ws.projectId}:${route.fullPath}`" ref="pageView" @project-created="refresh" />
          </router-view>
        </main>
      </div>
    </div>
  </ElConfigProvider>
</template>

<style scoped>
.workspace-refresh { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; color: #58709e; background: #ffffffa6; border: 1px solid #dce3ee; border-radius: 11px; transition: background .2s, border-color .2s, box-shadow .2s; }
.workspace-refresh:hover:not(:disabled) { background: #f0f3fa; border-color: #bbcbe2; box-shadow: 0 3px 10px #5672a518; }
.workspace-refresh:disabled { cursor: wait; opacity: .65; }
.spinning { animation: workspace-spin .8s linear infinite; }
.refresh-notice { color: #456398; font-size: 13px; }
@keyframes workspace-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
