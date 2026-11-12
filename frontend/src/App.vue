<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const nav = [
  ['/', '◫', '总览'],
  ['/datasets', '▤', '数据集'],
  ['/clean', '⌁', '数据清洗'],
  ['/analysis', '◷', '探索分析'],
  ['/studio', '▥', '可视化工作室'],
  ['/assistant', '✦', 'AI 分析助手'],
  ['/reports', '▣', '报告中心'],
  ['/tasks', '◴', '任务监控'],
];
 
const title = computed(() => nav.find((x) => x[0] === route.path)?.[2] || '数据集详情');

 
async function refresh() {
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
  } catch (e) {
    health.value = null;
    refreshError.value = `工作空间加载失败，现有信息可能不是最新的。${messageOf(e)}`;
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
            <AppSelect v-model="ws.projectId" class="project-select" aria-label="当前项目">
              <option value="">请选择项目</option>
              <option v-for="project in ws.projects" :key="project.id" :value="project.id">
                {{ project.name }}
              </option></AppSelect>
            <button class="icon-button" title="刷新状态" :disabled="loading" @click="refresh">↻</button>
            <span class="top-avatar">D</span>
          </div>
        </header>
        <main class="content">
          <div v-if="refreshError" class="error" role="alert">
            {{ refreshError }} <button class="button ghost" @click="refresh">重试</button>
          </div>
          <router-view :key="route.fullPath" @project-created="refresh" />
        </main>
      </div>
    </div>
  </ElConfigProvider>
</template>
