<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { messageOf } from '../api';  
import { useAuthStore } from '../auth';  
const emit = defineEmits(['logged-in']); 
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();  
const email = ref('');
const password = ref('');
const name = ref('');
const confirmPassword = ref('');
const mode = ref<'login' | 'register'>('login');
const busy = ref(false);  
const error = ref(route.query.unavailable === '1' ? '登录服务暂时不可用，请稍后重试。' : '');
async function login() {
  busy.value = true;  
  error.value = '';
  try {
    if (mode.value === 'register') {
      if (password.value.length < 10 || !/[A-Za-z]/.test(password.value) || !/[0-9]/.test(password.value)) {
        error.value = '密码至少 10 位，且同时包含字母和数字';
        return;
      }
      if (password.value !== confirmPassword.value) {
        error.value = '两次输入的密码不一致';
        return;
      }
      await auth.register(email.value, name.value, password.value);
    } else {
      await auth.login(email.value, password.value);
    }
    emit('logged-in');  
    const target = route.query.redirect;  
     
    const destination =
      typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login')
        ? target
        : '/';
    await router.replace(destination);   
  } catch (e) {
    error.value = messageOf(e);
  } finally {
    busy.value = false;  
  }
}
function switchMode(next: 'login' | 'register') {
  mode.value = next;
  error.value = '';
  email.value = '';
  password.value = '';
  name.value = '';
  confirmPassword.value = '';
}
</script>
<template>
  <div class="login-shell">
    <div class="login-hero">
      <div class="login-mark">◈ &nbsp; 数析工作台 / DATA WORKBENCH</div>
      <h1>让数据探索变得<br />直观而有依据。</h1>
      <p>从原始数据到可视化洞察，再到 AI 辅助解读。一个工作空间，完成完整的分析过程。</p>
      <div class="login-preview">
        <div style="font-size: 12px; color: #8cb3d9; margin-bottom: 20px">月度销售趋势 · 实时预览</div>
        <div class="login-preview-bars">
          <i v-for="(h, i) in [43, 61, 55, 72, 69, 89, 77, 100]" :key="i" :style="{ height: h + '%' }"></i>
        </div>
      </div>
    </div>
    <div class="login-form-wrap">
      <form class="login-form" @submit.prevent="login">
        <div style="font-size: 29px; color: #71829a; margin-bottom: 23px">◈</div>
        <h2>{{ mode === 'login' ? '欢迎回来' : '创建账号' }}</h2>
        <p>{{ mode === 'login' ? '登录后继续你的数据分析项目' : '创建属于自己的数据分析工作空间' }}</p>
        <div class="auth-tabs" role="group" aria-label="账号操作">
          <button type="button" :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button type="button" :class="{ active: mode === 'register' }" @click="switchMode('register')">注册账号</button>
        </div>
        <label class="field">邮箱地址<input v-model="email" type="email" autocomplete="username" required /></label
        ><label v-if="mode === 'register'" class="field">显示名称<input v-model="name" autocomplete="nickname" minlength="2" maxlength="40" required /></label
        ><label class="field"
          >{{ mode === 'login' ? '登录密码' : '设置密码' }}<input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :minlength="mode === 'login' ? 1 : 10" maxlength="128" required
        /></label>
        <label v-if="mode === 'register'" class="field">确认密码<input v-model="confirmPassword" type="password" autocomplete="new-password" required /></label>
        <div v-if="error" class="error">{{ error }}</div>
        <button class="button primary" :disabled="busy">{{ busy ? '请稍候…' : mode === 'login' ? '进入工作台 →' : '创建账号并进入 →' }}</button>
      </form>
    </div>
  </div>
</template>
<style scoped>
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 5px; margin: 18px 0 24px; border-radius: 12px; background: #f3f6f9; }
.auth-tabs button { border: 0; border-radius: 9px; background: transparent; color: #647892; padding: 10px; font: inherit; font-weight: 700; cursor: pointer; }
.auth-tabs button.active { background: #fff; color: #456398; box-shadow: 0 2px 9px #4563981c; }
</style>
