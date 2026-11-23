import fs from 'node:fs/promises';  
import path from 'node:path';  
import { fileURLToPath } from 'node:url';  
import mysql from 'mysql2/promise';  
import type { RowDataPacket } from 'mysql2';  

 
export interface Field {
  name: string;
  type: string;
  alias?: string;
  included?: boolean;
  [key: string]: unknown;
}
export interface User {
  id: string;
  email: string;
  name: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}
 
export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
 
export interface Dataset {
  id: string;
  name: string;
  projectId: string;
  file: string;
  originalName: string;
  rows: number;
  columns: number;
  fields: Field[];
  duplicates: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
 
export interface Version {
  id: string;
  datasetId: string;
  version: number;
  file: string;
  rows: number;
  createdAt: string;
  restoredFrom?: number;
  rules?: unknown[];
}
 
export interface Task {
  id: string;
  name: string;
  projectId: string;
  datasetId: string;
  type: string;
  status: string;
  progress: number;
  result: unknown;
  error?: string | null;
  params?: unknown;
  createdAt: string;
  updatedAt: string;
}
 
export interface Chart {
  id: string;
  name: string;
  projectId: string;
  datasetId: string;
  title: string;
  config: Record<string, unknown>;
  datasetVersion: number;
  createdAt: string;
  updatedAt: string;
}
 
export interface Report {
  id: string;
  name: string;
  projectId: string;
  title: string;
  sections: unknown[];
  status: string;
  createdAt: string;
  updatedAt: string;
}
 
export interface Session {
  id: string;
  name: string;
  projectId: string;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}
 
export interface Message {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
  result?: unknown;
  durationMs?: number;
  references?: unknown;
}
 
export interface KnowledgeChunk { id: string; index: number; text: string; vector?: number[] }
export interface KnowledgeDocument {
  id: string;
  projectId: string;
  name: string;
  content: string;
  status: 'indexing' | 'ready' | 'failed';
  mode: 'vector' | 'keyword';
  chunks: KnowledgeChunk[];
  revision: number;
  signature?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface State {
  knowledge: KnowledgeDocument[];
  users: User[];
  projects: Project[];
  datasets: Dataset[];
  versions: Version[];
  charts: Chart[];
  tasks: Task[];
  sessions: Session[];
  messages: Message[];
  reports: Report[];
  logs: unknown[];
}

 
const root = fileURLToPath(new URL('../../', import.meta.url));
 
 
const file = process.env.WORKBENCH_STATE_FILE || path.join(root, 'backend/data/state.json');
 
const empty = (): State => ({
  knowledge: [],
  users: [],
  projects: [],
  datasets: [],
  versions: [],
  charts: [],
  tasks: [],
  sessions: [],
  messages: [],
  reports: [],
  logs: [],
});
let state = empty();
 
let pool: ReturnType<typeof mysql.createPool> | undefined;

 
export async function initStore() {
   
  if (process.env.MYSQL_URL) {
     
    pool = mysql.createPool(process.env.MYSQL_URL);
     
    await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSON NOT NULL)');
     
    const [rows] = await pool.query<(RowDataPacket & { data: State })[]>('SELECT data FROM app_state WHERE id=1');
    state = rows[0]?.data || empty();  
  } else {
    try {
       
      state = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      state = empty();
    }
  }
   
  state.users ??= [];
  state.knowledge ??= [];
  for (const doc of state.knowledge) {
    if (doc.status === 'indexing') { doc.status = 'failed'; doc.error = '服务重启导致索引中断，请重试'; }
  }
}

 
export function db() {
  return state;
}

 
export function storageMode() {
  return pool ? 'mysql' : 'local-json';
}

 
async function persist(snapshot: string) {
  if (pool) {
     
    await pool.query('INSERT INTO app_state(id,data) VALUES(1,?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [
      snapshot,
    ]);
  } else {
     
    await fs.mkdir(path.dirname(file), { recursive: true });  
     
    const temp = `${file}.tmp`; 
    await fs.writeFile(temp, snapshot);
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temp, file); break; }
      catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code;
        if (attempt < 5 && ['EPERM', 'EBUSY', 'EACCES'].includes(code || '')) {
          await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
          continue;
        }
        throw new Error('状态保存失败，请稍后重试；若持续失败，请检查存储目录权限。', { cause });
      }
    }  
  }
}

let pendingSave: Promise<void> = Promise.resolve();
export function save() {
  const snapshot = JSON.stringify(state);
  const operation = pendingSave.catch(() => {}).then(() => persist(snapshot));
  pendingSave = operation;
  return operation;
}
