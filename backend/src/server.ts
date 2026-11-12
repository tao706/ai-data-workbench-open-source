import dotenv from 'dotenv';  
import express from 'express';
import cors from 'cors';  
import multer from 'multer';  
import jwt from 'jsonwebtoken';  
import { randomUUID } from 'node:crypto';  
import fs from 'node:fs/promises';  
import path from 'node:path';  
import { fileURLToPath } from 'node:url';  
import { z } from 'zod';  
import { streamExplanation, modelMode } from './ai.service.js';  
import { db, initStore, save, storageMode } from './store.js';  
import { hashPassword, verifyPassword } from './auth.service.js';
import type { Request, Response, NextFunction } from 'express';  
import type { Field } from './store.js';  

 
declare global {
  namespace Express {
    interface Request {
      traceId: string;
      user: { id: string; email: string };
    }
  }
}

 
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(projectRoot, '.env') });  

const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('replace-with'))) {
  throw new Error('Production requires a random JWT_SECRET of at least 32 characters');
}
if (production && !process.env.PUBLIC_ORIGIN?.startsWith('https://')) {
  throw new Error('Production requires an HTTPS PUBLIC_ORIGIN');
}
const app = express();
app.disable('x-powered-by');
if (production) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (production && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== process.env.PUBLIC_ORIGIN) {
    res.status(403).json({ code: 403, message: '请求来源不受支持', data: null });
    return;
  }
  next();
});
const authAttempts = new Map<string, { count: number; until: number }>();
const clearAttempts = setInterval(() => {
  for (const [key, value] of authAttempts) if (value.until <= Date.now()) authAttempts.delete(key);
}, 60_000);
clearAttempts.unref();
app.use(['/api/auth/login', '/api/auth/register'], (req, res, next) => {
  if (req.method !== 'POST') return next();
  const key = req.ip || 'unknown';
  let item = authAttempts.get(key);
  if (!item || item.until <= Date.now()) {
    item = { count: 0, until: Date.now() + 15 * 60_000 };
    authAttempts.set(key, item);
  }
  if (++item.count > 30) {
    res.setHeader('Retry-After', Math.ceil((item.until - Date.now()) / 1000));
    res.status(429).json({ code: 429, message: '操作过于频繁，请稍后再试', data: null });
    return;
  }
  next();
});  
 
app.use(
  cors({
    origin: production ? process.env.PUBLIC_ORIGIN : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5175', 'http://127.0.0.1:5175'],
    credentials: true,  
  }),
);

 
app.use(express.json({ limit: '1mb' })); 
const root = path.join(projectRoot, 'backend/uploads'); 
await fs.mkdir(root, { recursive: true });
await initStore();
if (!production && !db().users.some((user) => user.id === 'demo-user')) {
  const credentials = await hashPassword(process.env.DEMO_PASSWORD || 'Demo123456!');
  db().users.push({ id: 'demo-user', email: (process.env.DEMO_EMAIL || 'demo@example.com').toLowerCase(), name: '演示用户', ...credentials, createdAt: new Date().toISOString() });
  await save();
}
const analysis = process.env.ANALYSIS_URL || 'http://127.0.0.1:8100';
const secret = process.env.JWT_SECRET || 'local-demo-change-this-secret';
const sessionCookie = 'workbench_session';

 
const cookieOptions = {
  httpOnly: true,  
  sameSite: 'strict' as const,  
  secure: process.env.NODE_ENV === 'production',  
  path: '/api',  
};

const ok = (data: unknown, traceId: string) => ({ code: 0, message: 'ok', data, traceId });
const error = (message: string, status = 400) => Object.assign(new Error(message), { status });
const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : '未知错误');
const now = () => new Date().toISOString();  

 
const entity = <T extends object>(name: string, extras: T) => ({
  id: randomUUID(),  
  name,  
  createdAt: now(),  
  updatedAt: now(),  
  ...extras,  
});

 
function wrap(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res)).catch(next);
}

 
function projectFor(id: string, userId: string) {
  const p = db().projects.find((x) => x.id === id);
  if (!p || p.ownerId !== userId) throw error('项目不存在', 404);
  return p;
}

 
function datasetFor(id: string, userId: string) {
  const d = db().datasets.find((x) => x.id === id);
  if (!d) throw error('数据集不存在', 404);
  projectFor(d.projectId, userId);
  return d;
}
function ownedProjects(userId: string) {
  return new Set(db().projects.filter((project) => project.ownerId === userId).map((project) => project.id));
}

 
async function compute(route: string, body: object): Promise<any> {
  let response;  
  try {
     
    response = await fetch(`${analysis}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw error('分析服务未启动或请求超时，请先启动 FastAPI', 503);
  }
  let result;
  try {
     
    result = JSON.parse(await response.text());
  } catch {
    throw error('数据解析服务返回异常，请检查文件表头格式后重试', 502);
  }
  if (!response.ok)
    throw error(typeof result.detail === 'string' ? result.detail : '分析服务执行失败', response.status);
  return result.data;
}

 
function auth(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.cookie  
    ?.split(';')  
    .map((part) => part.trim())  
    .find((part) => part.startsWith(`${sessionCookie}=`))  
    ?.slice(sessionCookie.length + 1);  
  try {
     
    const claims = jwt.verify(token || '', secret) as { id: string; email: string };
    const user = db().users.find((item) => item.id === claims.id);
    if (!user) throw error('账号不存在', 401);
    req.user = { id: user.id, email: user.email };
    next();
  } catch {
    next(error('请先登录或重新登录', 401));
  }
}

 
const upload = multer({
   
  storage: multer.diskStorage({
    destination: root,  
     
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
   
  limits: { fileSize: 30 * 1024 * 1024 },
   
  fileFilter: (_req, file, cb) => cb(null, ['.csv', '.xlsx'].includes(path.extname(file.originalname).toLowerCase())),
});

 
app.use((req, res, next) => {
  req.traceId = randomUUID();  
  res.setHeader('x-trace-id', req.traceId);  
  next();  
});

 
app.get(
  '/api/health',
  wrap(async (req, res) => {
    let python = 'offline';  
    try {
       
       
      const r = await fetch(`${analysis}/internal/health`, { signal: AbortSignal.timeout(2000) });
      const body = await r.json();  
      python = r.ok && body.service === 'fastapi' ? 'online' : 'offline';
    } catch {}  
    res.json(
      ok(
        {
          express: 'online',
          fastapi: python,
          database: storageMode(),  
           
          model: process.env.OPENAI_API_KEY ? 'configured' : 'mock',
        },
        req.traceId,
      ),
    );
  }),
);

 
app.post(
  '/api/auth/login',
   
  wrap(async (req, res) => {
     
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = db().users.find((item) => item.email === input.email.trim().toLowerCase());
    if (!user || !(await verifyPassword(input.password, user.salt, user.passwordHash)))
      throw error('账号或密码错误', 401);
     
     
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '12h' });
    res.setHeader('cache-control', 'no-store');  
     
    res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
     
    res.json(ok({ id: user.id, email: user.email, name: user.name }, req.traceId));
  }),
);

app.post('/api/auth/register', wrap(async (req, res) => {
  const input = z.object({
    email: z.string().trim().email().max(254),
    name: z.string().trim().min(2).max(40),
    password: z.string().min(10).max(128),
  }).parse(req.body);
  if (!/[A-Za-z]/.test(input.password) || !/[0-9]/.test(input.password))
    throw error('密码至少 10 位，且同时包含字母和数字');
  const email = input.email.toLowerCase();
  if (db().users.some((user) => user.email === email)) throw error('该邮箱已注册', 409);
  const credentials = await hashPassword(input.password);
  if (db().users.some((user) => user.email === email)) throw error('该邮箱已注册', 409);
  const user = { id: randomUUID(), email, name: input.name, ...credentials, createdAt: now() };
  db().users.push(user);
  await save();
  const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '12h' });
  res.setHeader('cache-control', 'no-store');
  res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
  res.status(201).json(ok({ id: user.id, email: user.email, name: user.name }, req.traceId));
}));

 
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(sessionCookie, cookieOptions);  
  res.setHeader('cache-control', 'no-store');  
  res.json(ok(true, req.traceId));  
});

 
app.use('/api', auth); 

 
app.get('/api/auth/me', (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const user = db().users.find((item) => item.id === req.user.id)!;
  res.json(ok({ id: user.id, email: user.email, name: user.name }, req.traceId));
});

 
app.get(
  '/api/dashboard',
  wrap(async (req, res) =>
    res.json(
      ok(
        {
          projects: db().projects.filter((p) => p.ownerId === req.user.id).length,  
          datasets: db().datasets.filter((d) => ownedProjects(req.user.id).has(d.projectId)).length,  
          charts: db().charts.filter((c) => ownedProjects(req.user.id).has(c.projectId)).length,  
          tasks: db().tasks.filter((t) => ownedProjects(req.user.id).has(t.projectId)).length,  
          reports: db().reports.filter((r) => ownedProjects(req.user.id).has(r.projectId)).length,  
          recentDatasets: db().datasets.filter((d) => ownedProjects(req.user.id).has(d.projectId)).slice(-5).reverse(),  
          recentTasks: db().tasks.filter((t) => ownedProjects(req.user.id).has(t.projectId)).slice(-5).reverse(),  
        },
        req.traceId,  
      ),
    ),
  ),
);

 
app.get(
  '/api/projects',
   
  wrap(async (req, res) => res.json(ok(db().projects.filter((p) => p.ownerId === req.user.id), req.traceId))),
);

 
app.post(
  '/api/projects',
  wrap(async (req, res) => {
    const { name, description } = z  
      .object({ name: z.string().trim().min(1).max(80), description: z.string().max(500).default('') })
      .parse(req.body);  
     
    const p = entity(name, { description, ownerId: req.user.id });
    db().projects.push(p);  
    await save();  
    res.status(201).json(ok(p, req.traceId));  
  }),
);

 
app.get(
  '/api/projects/:id',
   
  wrap(async (req, res) => res.json(ok(projectFor(req.params.id, req.user.id), req.traceId))),
);

 
app.patch(
  '/api/projects/:id',
  wrap(async (req, res) => {
    const p = projectFor(req.params.id, req.user.id);  
     
    const input = z
      .object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().max(500).optional() })
      .parse(req.body);
     
    Object.assign(p, input, { updatedAt: now() });
    await save();  
    res.json(ok(p, req.traceId));  
  }),
);

 
app.delete(
  '/api/projects/:id',
  wrap(async (req, res) => {
    projectFor(req.params.id, req.user.id);  
     
    if (db().datasets.some((d) => d.projectId === req.params.id)) throw error('请先删除项目下的数据集');
    db().projects = db().projects.filter((p) => p.id !== req.params.id);
    await save();  
    res.json(ok(true, req.traceId));
  }),
);

 
app.get(
  '/api/datasets',
   
  wrap(async (req, res) =>
    res.json(
      ok(
        db()
          .datasets.filter((d) => ownedProjects(req.user.id).has(d.projectId) && (!req.query.projectId || d.projectId === req.query.projectId))
          .slice()     
          .reverse(),  
        req.traceId,
      ),
    ),
  ),
);

 
app.post(
  '/api/datasets/upload',
  upload.single('file'),  
  wrap(async (req, res) => {
     
    if (!req.file) throw error('请选择 CSV 或 XLSX 文件');
     
    if (/^[\u0000-\u00ff]*$/.test(req.file.originalname)) {
       
      const decoded = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
       
      if (!decoded.includes('\ufffd')) req.file.originalname = decoded;
    }
    try {
       
      projectFor(req.body.projectId, req.user.id);
       
      const profile = await compute('/internal/datasets/profile', { file: req.file.path });
       
      const d = entity(path.parse(req.file.originalname).name, {
        projectId: req.body.projectId,
        file: req.file.path,
        originalName: req.file.originalname,
        rows: profile.rows,
        columns: profile.columns,
        fields: profile.fields,
        duplicates: profile.duplicates,
        version: 1,
      });
      db().datasets.push(d);  
       
      db().versions.push({
        id: randomUUID(),
        datasetId: d.id,
        version: 1,
        file: d.file,
        rows: d.rows,
        createdAt: now(),
      });
      await save();  
      res.status(201).json(ok(d, req.traceId));
    } catch (e) {
       
      await fs.unlink(req.file.path).catch(() => {});
      throw e;
    }
  }),
);

 
app.post(
  '/api/datasets/sample',
  wrap(async (req, res) => {
    const input = z.object({ projectId: z.string().uuid() }).parse(req.body);
    projectFor(input.projectId, req.user.id);
    const content =
      '月份,区域,产品,销售额,订单数\n1月,华东,A产品,12000,80\n1月,华南,B产品,9500,62\n2月,华东,A产品,14000,91\n2月,华南,B产品,10800,70\n3月,华东,A产品,15500,99\n3月,华南,B产品,11800,76\n4月,华东,A产品,13800,89\n4月,华南,B产品,12500,82\n5月,华东,A产品,16700,108\n5月,华南,B产品,13100,86\n6月,华东,A产品,18100,118\n6月,华南,B产品,14500,95\n';
    const file = path.join(root, `${randomUUID()}.csv`);
    await fs.writeFile(file, '\uFEFF' + content);
    const profile = await compute('/internal/datasets/profile', { file });
    const d = entity('销售示例数据', {
      projectId: input.projectId,
      file,
      originalName: '销售示例数据.csv',
      rows: profile.rows,
      columns: profile.columns,
      fields: profile.fields,
      duplicates: profile.duplicates,
      version: 1,
    });
    db().datasets.push(d);
    db().versions.push({ id: randomUUID(), datasetId: d.id, version: 1, file, rows: d.rows, createdAt: now() });
    await save();
    res.status(201).json(ok(d, req.traceId));
  }),
);

 
app.get(
  '/api/datasets/:id',
   
  wrap(async (req, res) => res.json(ok(datasetFor(req.params.id, req.user.id), req.traceId))),
);

 
app.patch(
  '/api/datasets/:id/fields/:name',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    const field = d.fields.find((f) => f.name === req.params.name);
    if (!field) throw error('字段不存在', 404);
     
     
     
    const input = z.object({ alias: z.string().max(80).optional(), included: z.boolean().optional() }).parse(req.body);
    Object.assign(field, input);  
    d.updatedAt = now();
    await save();
    res.json(ok(field, req.traceId));
  }),
);

 
app.patch(
  '/api/datasets/:id',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
     
    Object.assign(d, input, { updatedAt: now() }); 
    await save();  
    res.json(ok(d, req.traceId));
  }),
);


 
app.delete(
  '/api/datasets/:id',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    db().datasets = db().datasets.filter((x) => x.id !== d.id);
    await save();  
    res.json(ok(true, req.traceId));
  }),
);


 
app.get(
  '/api/datasets/:id/preview',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    const input = z
      .object({
        offset: z.coerce.number().int().min(0).default(0),   
        limit: z.coerce.number().int().min(1).max(1000).default(100),   
      })
      .parse(req.query);
     
    res.json(ok(await compute('/internal/datasets/preview', { file: d.file, ...input }), req.traceId));
  }),
);


 
app.get(
  '/api/datasets/:id/versions',
  wrap(async (req, res) => {
    datasetFor(req.params.id, req.user.id);  
    res.json(
      ok(
        db().versions.filter((v) => v.datasetId === req.params.id),
        req.traceId,
      ),
    );
  }),
);


 
app.post(
  '/api/datasets/:id/restore',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    const input = z.object({ version: z.number().int().min(1) }).parse(req.body);
     
    const selected = db().versions.find((v) => v.datasetId === d.id && v.version === input.version);
    if (!selected) throw error('版本不存在', 404);
     
    const profile = await compute('/internal/datasets/profile', { file: selected.file });
     
    const latest = Math.max(
      ...db() 
        .versions.filter((v) => v.datasetId === d.id)
        .map((v) => v.version),
    );
     
    const oldFields = new Map(d.fields.map((f) => [f.name, f])); 
     
    const fields = profile.fields.map((f: Field) => ({
      ...f,  
      alias: oldFields.get(f.name)?.alias,  
      included: oldFields.get(f.name)?.included,  
    }));
     
    Object.assign(d, {
      file: selected.file,
      rows: profile.rows,
      columns: profile.columns,
      fields,
      duplicates: profile.duplicates,
      version: latest + 1,
      updatedAt: now(),
    });
     
    db().versions.push({
      id: randomUUID(),
      datasetId: d.id,
      version: d.version,
      file: d.file,
      rows: d.rows,
      restoredFrom: input.version,
      createdAt: now(),
    });
    await save();
    res.json(ok(d, req.traceId));
  }),
);


 
app.post(
  '/api/datasets/:id/clean',
  wrap(async (req, res) => {
     
    const d = datasetFor(req.params.id, req.user.id);
     
    const input = z
      .object({
        rules: z
          .array( 
            z.object({
              operation: z.string(),  
              field: z.string().optional(),  
              value: z.union([z.string(), z.number()]).optional(),  
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(req.body);
     
    const task = entity('数据清洗', {
      projectId: d.projectId,  
      datasetId: d.id,  
      type: 'clean',  
      status: 'running',  
      progress: 20,  
      result: null,
      error: null,
    });
     
    db().tasks.push(task);
    await save();
    try {
       
      const result = await compute('/internal/datasets/clean', { file: d.file, rules: input.rules });
       
      const oldFields = new Map(d.fields.map((f) => [f.name, f]));
      const fields = result.fields.map((f: Field) => ({
        ...f,
        alias: oldFields.get(f.name)?.alias,  
        included: oldFields.get(f.name)?.included,  
      }));
       
      Object.assign(d, { file: result.file, rows: result.afterRows, fields, version: d.version + 1, updatedAt: now() });
       
      db().versions.push({
        id: randomUUID(),
        datasetId: d.id,
        version: d.version,
        file: d.file,
        rows: d.rows,
        rules: input.rules,
        createdAt: now(),
      });
       
      Object.assign(task, { status: 'completed', progress: 100, result, updatedAt: now() });
      await save();
      res.json(ok({ task, dataset: d }, req.traceId));
    } catch (e) {
       
      Object.assign(task, { status: 'failed', error: errorMessage(e), updatedAt: now() });
      await save();
      throw e;
    }
  }),
);

 
app.post(
  '/api/analysis/tasks',
  wrap(async (req, res) => {
     
    const input = z
      .object({
        datasetId: z.string().uuid(),
        type: z.enum(['descriptive', 'groupby', 'correlation']),
        dimension: z.string().optional(),
        metric: z.string().optional(),
        aggregate: z.enum(['count', 'sum', 'mean', 'min', 'max']).optional(),
      })
      .parse(req.body);
     
    const d = datasetFor(input.datasetId, req.user.id);
     
    const task = entity(input.type, {
      projectId: d.projectId,
      datasetId: d.id,
      type: input.type,
      status: 'running',
      progress: 20,
      params: input,
      result: null,
    });
     
    db().tasks.push(task);
    await save();
    try {
       
      const result = await compute(`/internal/analysis/${input.type}`, { file: d.file, ...input });
       
      Object.assign(task, { status: 'completed', progress: 100, result, updatedAt: now() });
      await save();  
      res.status(201).json(ok(task, req.traceId));
    } catch (e) {
       
      Object.assign(task, { status: 'failed', error: errorMessage(e), updatedAt: now() });
      await save();
      throw e;
    }
  }),
);

 
 
app.get(
  '/api/tasks',
  wrap(async (req, res) =>
    res.json(
      ok(
        db()
          .tasks.filter((t) => ownedProjects(req.user.id).has(t.projectId) && (!req.query.projectId || t.projectId === req.query.projectId))
          .slice()
          .reverse(),
        req.traceId,
      ),
    ),
  ),
);
app.get(
  '/api/tasks/:id',
  wrap(async (req, res) => {
    const task = db().tasks.find((t) => t.id === req.params.id);
    if (!task) throw error('任务不存在', 404);
    projectFor(task.projectId, req.user.id);
    res.json(ok(task, req.traceId));
  }),
);
app.delete(
  '/api/tasks/:id',
  wrap(async (req, res) => {
    const task = db().tasks.find((t) => t.id === req.params.id);
    if (!task) throw error('任务不存在', 404);
    projectFor(task.projectId, req.user.id);
    if (task.status === 'running') throw error('任务运行中，完成后再删除', 409);
    db().tasks = db().tasks.filter((t) => t.id !== task.id);
    await save();
    res.json(ok(true, req.traceId));
  }),
);
app.get(
  '/api/tasks/:id/events',
  wrap(async (req, res) => {
    const task = db().tasks.find((t) => t.id === req.params.id);
    if (!task) throw error('任务不存在', 404);
    projectFor(task.projectId, req.user.id);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    res.write(`event: progress\ndata: ${JSON.stringify(task)}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify(task)}\n\n`);
    res.end();
  }),
);
app.post(
  '/api/charts/data',
  wrap(async (req, res) => {
    const input = z
      .object({
        datasetId: z.string().uuid(),
        version: z.number().int().min(1).optional(),
        chartType: z.enum(['bar', 'line', 'area', 'pie', 'scatter', 'table']),
        dimension: z.string(),
        metric: z.string().optional(),
        aggregate: z.enum(['count', 'sum', 'mean', 'min', 'max']).default('count'),
        limit: z.number().min(1).max(100).default(20),
        filterField: z.string().optional(),
        filterValue: z.string().optional(),
        sort: z.enum(['asc', 'desc']).default('desc'),
      })
      .parse(req.body);
    const d = datasetFor(input.datasetId, req.user.id);
     
    const version = input.version === undefined
      ? undefined
      : db().versions.find((item) => item.datasetId === d.id && item.version === input.version);
    if (input.version !== undefined && !version) throw error('图表关联的数据版本不存在', 404);
    res.json(
      ok(
        await compute('/internal/analysis/chart-data', {
          file: version?.file || d.file,
          chart_type: input.chartType,
          dimension: input.dimension,
          metric: input.metric,
          aggregate: input.aggregate,
          limit: input.limit,
          filter_field: input.filterField,
          filter_value: input.filterValue,
          sort: input.sort,
        }),
        req.traceId,
      ),
    );
  }),
);
app.get(
  '/api/charts',
  wrap(async (req, res) =>
    res.json(
      ok(
        db()
          .charts.filter((c) => ownedProjects(req.user.id).has(c.projectId) && (!req.query.projectId || c.projectId === req.query.projectId))
          .slice()
          .reverse(),
        req.traceId,
      ),
    ),
  ),
);
app.post(
  '/api/charts',
  wrap(async (req, res) => {
    const input = z
      .object({
        projectId: z.string().uuid(),
        datasetId: z.string().uuid(),
        version: z.number().int().min(1).optional(),
        title: z.string().min(1).max(100),
        config: z.record(z.unknown()),
      })
      .parse(req.body);
    projectFor(input.projectId, req.user.id);
    const d = datasetFor(input.datasetId, req.user.id);
    if (d.projectId !== input.projectId) throw error('数据集不属于该项目');
    if (input.version !== undefined && !db().versions.some((v) => v.datasetId === d.id && v.version === input.version))
      throw error('图表关联的数据版本不存在', 404);
    const chart = entity(input.title, {
      projectId: input.projectId!,
      datasetId: input.datasetId!,
      title: input.title!,
      config: input.config!,
      datasetVersion: input.version ?? d.version,
    });
    db().charts.push(chart);
    await save();
    res.status(201).json(ok(chart, req.traceId));
  }),
);
app.delete(
  '/api/charts/:id',
  wrap(async (req, res) => {
    const chart = db().charts.find((c) => c.id === req.params.id);
    if (!chart) throw error('图表不存在', 404);
    projectFor(chart.projectId, req.user.id);
    db().charts = db().charts.filter((c) => c.id !== req.params.id);
    await save();
    res.json(ok(true, req.traceId));
  }),
);
app.get(
  '/api/reports',
  wrap(async (req, res) =>
    res.json(
      ok(
        db()
          .reports.filter((r) => ownedProjects(req.user.id).has(r.projectId) && (!req.query.projectId || r.projectId === req.query.projectId))
          .slice()
          .reverse(),
        req.traceId,
      ),
    ),
  ),
);
app.post(
  '/api/reports',
  wrap(async (req, res) => {
    const input = z
      .object({
        projectId: z.string().uuid(),
        title: z.string().min(1).max(100),
        sections: z.array(
          z.object({
            type: z.enum(['text', 'chart']),
            title: z.string(),
            content: z.string().optional(),
            chartId: z.string().optional(),
          }),
        ),
      })
      .parse(req.body);
    projectFor(input.projectId, req.user.id);
    for (const section of input.sections) {
      if (!section.chartId) continue;
      const chart = db().charts.find((item) => item.id === section.chartId);
      if (!chart || chart.projectId !== input.projectId) throw error('报告引用的图表不属于当前项目');
    }
    const report = entity(input.title, {
      projectId: input.projectId!,
      title: input.title!,
      sections: input.sections!,
      status: 'draft',
    });
    db().reports.push(report);
    await save();
    res.status(201).json(ok(report, req.traceId));
  }),
);
app.get(
  '/api/reports/:id',
  wrap(async (req, res) => {
    const report = db().reports.find((r) => r.id === req.params.id);
    if (!report) throw error('报告不存在', 404);
    projectFor(report.projectId, req.user.id);
    res.json(ok(report, req.traceId));
  }),
);

const plans = [
  { match: /相关|关系|关联/, type: 'correlation', title: '计算数值字段相关性' },
  { match: /趋势|变化|每月|月度/, type: 'groupby', title: '按维度计算趋势' },
  { match: /对比|分组|区域|产品/, type: 'groupby', title: '按类别分组聚合' },
];
app.post(
  '/api/ai/plan',
  wrap(async (req, res) => {
    const input = z.object({ datasetId: z.string().uuid(), question: z.string().min(2).max(500) }).parse(req.body);
    const d = datasetFor(input.datasetId, req.user.id);
    const rule = plans.find((x) => x.match.test(input.question)) || { type: 'descriptive', title: '生成基础数据画像' };
    const number = d.fields.find((f) => f.type === 'number');
    const text = d.fields.find((f) => f.type !== 'number');
    const plan = {
      type: rule.type,
      title: rule.title,
      datasetId: d.id,
      dimension: text?.name,
      metric: number?.name,
      aggregate: 'sum',
    };
    res.json(ok(plan, req.traceId));
  }),
);
app.post(
  '/api/ai/chat',
  wrap(async (req, res) => {
    const input = z
      .object({
        datasetId: z.string().uuid(),
        question: z.string().min(2).max(500),
        plan: z.object({
          type: z.enum(['descriptive', 'groupby', 'correlation']),
          dimension: z.string().optional(),
          metric: z.string().optional(),
          aggregate: z.enum(['count', 'sum', 'mean', 'min', 'max']).optional(),
        }),
      })
      .parse(req.body);
    const d = datasetFor(input.datasetId, req.user.id);
    const start = Date.now();
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const send = (event: string, data: unknown) => {
      if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('meta', { dataset: d.name, model: modelMode(), traceId: req.traceId });
    try {
      send('progress', { stage: '正在执行已确认的分析计划', progress: 25 });
      const result = await compute(`/internal/analysis/${input.plan.type}`, { file: d.file, ...input.plan });
      if (closed) return;
      send('progress', { stage: '计算完成，正在生成解释', progress: 65 });
      const answer = await streamExplanation({
        question: input.question,
        dataset: d,
        plan: input.plan,
        result,
        sendToken: (text) => send('token', { text }),
        isClosed: () => closed,
      });
      if (closed) return;
      const session = entity('AI分析', { projectId: d.projectId, datasetId: d.id });
      db().sessions.push(session);
      db().messages.push(
        { id: randomUUID(), sessionId: session.id, role: 'user', content: input.question, createdAt: now() },
        {
          id: randomUUID(),
          sessionId: session.id,
          role: 'assistant',
          content: answer,
          result,
          durationMs: Date.now() - start,
          createdAt: now(),
        },
      );
      await save();
      send('done', { sessionId: session.id, durationMs: Date.now() - start, source: d.name, result });
      res.end();
    } catch (e) {
      send('error', { message: modelMode() === 'langchain' ? '模型解读失败，请检查模型服务配置后重试。统计计算结果仍可在分析页查看。' : errorMessage(e) });
      res.end();
    }
  }),
);
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const uploadTooLarge = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
  const status = uploadTooLarge
    ? 413
    : err.status || (err instanceof z.ZodError || err instanceof multer.MulterError ? 400 : 500);
  const message = uploadTooLarge
    ? '文件超过 30 MB，请选择更小的 CSV 或 XLSX 文件。'
    : err instanceof z.ZodError
      ? err.issues.map((x) => x.message).join('; ')
      : err.message || '服务错误';
  if (!res.headersSent) res.status(status).json({ code: status, message, data: null, traceId: req.traceId });
});
app.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1', () =>
  console.log(`API http://127.0.0.1:${process.env.PORT || 3100}`),
);
