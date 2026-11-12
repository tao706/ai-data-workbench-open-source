import { createApp } from 'vue';  
import { createPinia } from 'pinia';  
import { createRouter, createWebHistory } from 'vue-router';  
import App from './App.vue';  
import AppSelect from './components/AppSelect.vue';  
import { useAuthStore } from './auth';
 
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/el-button.css';
import 'element-plus/theme-chalk/el-overlay.css';
import 'element-plus/theme-chalk/el-dialog.css';
import 'element-plus/theme-chalk/el-form.css';
import 'element-plus/theme-chalk/el-form-item.css';
import 'element-plus/theme-chalk/el-input.css';
import 'element-plus/theme-chalk/el-table.css';
import 'element-plus/theme-chalk/el-table-column.css';
import 'element-plus/theme-chalk/el-pagination.css';
import './style.css';
import './responsive.css';
import './theme.css';  
 
localStorage.removeItem('workbench-token');
const routes = [
   
  { path: '/login', name: 'login', meta: { public: true }, component: () => import('./pages/Login.vue') },
   
  { path: '/', component: () => import('./pages/Overview.vue') },
   
  { path: '/datasets', component: () => import('./pages/Datasets.vue') },
   
  { path: '/datasets/:id', component: () => import('./pages/DatasetDetail.vue') },
   
  { path: '/clean', component: () => import('./pages/Clean.vue') },
   
  { path: '/analysis', component: () => import('./pages/Analysis.vue') },
   
  { path: '/studio', component: () => import('./pages/Studio.vue') },
   
  { path: '/assistant', component: () => import('./pages/Assistant.vue') },
   
  { path: '/reports', component: () => import('./pages/Reports.vue') },
   
  { path: '/tasks', component: () => import('./pages/Tasks.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];
 
const router = createRouter({ history: createWebHistory(), routes });
const pinia = createPinia();  

 
 
router.beforeEach(async to => { 
   
  const authStore = useAuthStore(pinia);
  try {
    const user = await authStore.loadUser();  
     
    if (to.meta.public) {
      const redirect = to.query.redirect;  
       
      if (user) return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/login') ? redirect : '/';
      return;
    }
     
    if (!user) return { name: 'login', query: { redirect: to.fullPath } };
  } catch {
     
    if (!to.meta.public) return { name: 'login', query: { redirect: to.fullPath, unavailable: '1' } };
  }
});

 
 
 
 
 
createApp(App).component('AppSelect', AppSelect).use(pinia).use(router).mount('#app');
