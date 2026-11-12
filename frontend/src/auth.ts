import axios from 'axios';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { api } from './api';

 
export type AuthUser = { id: string; email: string; name: string };

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<AuthUser | null>(null);
  const checked = ref(false);  
  const loading = ref(false);  
  const isAuthenticated = computed(() => user.value !== null);  
  let pendingLoad: Promise<AuthUser | null> | null = null;  

   
   
  async function loadUser(force = false): Promise<AuthUser | null> {
     
    if (checked.value && !force) return user.value; 
    if (pendingLoad) return pendingLoad;  
    loading.value = true;  
     
    pendingLoad = (async () => {
      try {
        user.value = await api<AuthUser>('get', '/auth/me');  
        checked.value = true;    
        return user.value;
      } catch (cause) { 
        user.value = null;  
         
         
        if (axios.isAxiosError(cause) && cause.response?.status === 401) {
          checked.value = true;
          return null;
        }
        checked.value = false;
        throw cause;
      } finally {
        loading.value = false;
      }
    })();
    try { return await pendingLoad; }
    finally { pendingLoad = null; }  
  }


  async function login(email: string, password: string) {
     
    user.value = await api<AuthUser>('post', '/auth/login', { email, password });
    checked.value = true;
    return user.value;
  }

  async function register(email: string, name: string, password: string) {
    user.value = await api<AuthUser>('post', '/auth/register', { email, name, password });
    checked.value = true;
    return user.value;
  }

  async function logout() {
    await api('post', '/auth/logout');
    user.value = null;
    checked.value = true;
  }

  return { user, checked, loading, isAuthenticated, loadUser, login, register, logout };
});
