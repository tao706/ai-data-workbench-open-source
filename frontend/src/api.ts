import axios from 'axios';







 
 
 
 
const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
});

 
 
http.interceptors.response.use(
  (r) => r,  
  (err) => {
     
     
    const isExcluded = ['/auth/login', '/auth/me'].includes(err.config?.url);
    if (err.response?.status === 401 && !isExcluded) {
       
       
      if (location.pathname !== '/login') {
         
        const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
         
        location.replace(`/login?redirect=${redirect}`);  
      }
    }
    return Promise.reject(err);  
  },
);








export async function api<T>(
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  data?: unknown,
): Promise<T> {
   
  const r = await http.request<{ data: T }>({ method, url, data }); 
  return r.data.data;
}





export function messageOf(error: unknown) {
   
  if (axios.isAxiosError(error)) {
     
    if (error.code === 'ERR_CANCELED') return '操作已取消。';
     
    if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试。';
     
    if (!error.response) return '连接失败，请检查网络或确认工作台服务已启动。';
     
    return error.response.data?.message || '操作失败，请稍后重试。';
  }
   
  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}










export async function uploadDataset(
  projectId: string,
  file: File,
  onProgress: (n: number) => void,  
  signal?: AbortSignal,  
) {
  const form = new FormData();  
  form.append('projectId', projectId);  
  form.append('file', file);  
   
   
  const r = await http.post('/datasets/upload', form, {
    signal, 
     
    onUploadProgress: (event) =>
       
      onProgress(Math.round((event.loaded / (event.total || event.loaded)) * 100)),
  });
  return r.data.data;
}











export async function streamAi(
  body: unknown,
  onEvent: (name: string, data: any) => void,
  signal: AbortSignal, 
) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    credentials: 'include',  
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

   
  if (response.status === 401) {
    const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`/login?redirect=${redirect}`);
    throw new Error('登录状态已失效，请重新登录');
  }

   
   
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message || '分析请求失败，请稍后重试。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';         
  let completed = false;   
  let failed = false;      

  






  const consume = (chunk: string) => {
    const event = chunk.match(/^event: (.+)$/m)?.[1];
    const data = chunk.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) return;  

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('分析结果传输异常，请重新生成。');  
    }

    if (event === 'done') completed = true;
    if (event === 'error') failed = true;
    onEvent(event, parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

     
     
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');

    const chunks = buffer.split('\n\n');
     
    buffer = chunks.pop() || '';
    for (const chunk of chunks) consume(chunk);
  }

   
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);

   
   
  if (!signal.aborted && !completed && !failed) {
    throw new Error('连接已中断，分析结果可能不完整，请重新生成。');
  }
}
