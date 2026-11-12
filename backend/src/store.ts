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
}
 
export interface State {
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
}

 
export function db() {
  return state;
}

 
export function storageMode() {
  return pool ? 'mysql' : 'local-json';
}

 
async function persist() {
  if (pool) {
     
    await pool.query('INSERT INTO app_state(id,data) VALUES(1,?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [
      JSON.stringify(state),
    ]);
  } else {
     
    await fs.mkdir(path.dirname(file), { recursive: true });  
     
    const temp = `${file}.tmp`; 
    await fs.writeFile(temp, JSON.stringify(state, null, 2));
    await fs.rename(temp, file);  
  }
}

let pendingSave: Promise<void> = Promise.resolve();
export function save() {
  pendingSave = pendingSave.then(persist, persist);
  return pendingSave;
}
