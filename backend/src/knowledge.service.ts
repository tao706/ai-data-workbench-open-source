import { randomUUID, createHash } from 'node:crypto';
import { db, save } from './store.js';
import type { KnowledgeDocument, KnowledgeChunk } from './store.js';

export type Citation = { id: string; documentId: string; name: string; chunk: number; text: string; score: number };
export type Retrieval = { mode: 'vector' | 'keyword' | 'off'; sources: Citation[]; notice: string };
const jobs = new Map<string, AbortController>();
const timestamp = () => new Date().toISOString();

function embeddingConfig() {
  const model = process.env.EMBEDDING_MODEL?.trim();
  if (!model) return undefined;
  const key = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('已配置向量模型，但缺少 EMBEDDING_API_KEY 或模型密钥');
  const base = (process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const signature = createHash('sha256').update(`${base}|${model}`).digest('hex');
  return { model, key, base, signature };
}

export function retrievalMode() {
  return process.env.EMBEDDING_MODEL?.trim() ? 'vector' : 'keyword';
}

export function splitDocument(text: string): KnowledgeChunk[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!normalized || normalized.length > 50000) throw new Error('资料正文需为 1 至 50000 个字符');
  const chunks: KnowledgeChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + 700, normalized.length);
    if (end < normalized.length) {
      const newline = normalized.lastIndexOf('\n', end);
      if (newline > start + 350) end = newline;
    }
    chunks.push({ id: randomUUID(), index: chunks.length + 1, text: normalized.slice(start, end) });
    if (end === normalized.length) break;
    start = end - 100;
  }
  return chunks;
}

async function embed(texts: string[], config: NonNullable<ReturnType<typeof embeddingConfig>>, signal?: AbortSignal) {
  const response = await fetch(`${config.base}/embeddings`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '向量服务鉴权失败，请检查服务端密钥' : response.status === 429 ? '向量服务限流或额度不足，请稍后重试' : '向量服务不可用，请检查服务端配置后重试');
  const body = await response.json() as { data?: { index: number; embedding: number[] }[] };
  const rows = body.data?.slice().sort((a, b) => a.index - b.index);
  if (!rows || rows.length !== texts.length || rows.some((row, i) => row.index !== i || !Array.isArray(row.embedding) || !row.embedding.length || row.embedding.length > 8192 || row.embedding.some(v => !Number.isFinite(v)) || !row.embedding.some(v => v !== 0))) throw new Error('向量服务返回格式异常');
  const dimensions = rows[0].embedding.length;
  if (rows.some(row => row.embedding.length !== dimensions)) throw new Error('向量服务返回维度不一致');
  return rows.map(row => row.embedding);
}

export function publicDocument(doc: KnowledgeDocument) {
  return { id: doc.id, projectId: doc.projectId, name: doc.name, characters: doc.content.length, status: doc.status, mode: doc.mode, error: doc.error, chunkCount: doc.chunks.length, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}

export async function indexDocument(doc: KnowledgeDocument) {
  jobs.get(doc.id)?.abort();
  const controller = new AbortController();
  jobs.set(doc.id, controller);
  const revision = ++doc.revision;
  const alive = () => !controller.signal.aborted && db().knowledge.includes(doc) && doc.revision === revision;
  doc.status = 'indexing'; doc.error = ''; doc.chunks = []; doc.updatedAt = timestamp();
  try {
    await save();
    const chunks = splitDocument(doc.content);
    const config = embeddingConfig();
    if (config) {
      for (let start = 0; start < chunks.length; start += 16) {
        const batch = chunks.slice(start, start + 16);
        const vectors = await embed(batch.map(chunk => chunk.text), config, controller.signal);
        batch.forEach((chunk, i) => { chunk.vector = vectors[i]; });
        if (!alive()) return;
      }
    }
    if (!alive()) return;
    doc.chunks = chunks; doc.mode = config ? 'vector' : 'keyword'; doc.signature = config?.signature;
    doc.status = 'ready'; doc.updatedAt = timestamp();
  } catch (cause) {
    if (!alive()) return;
    doc.status = 'failed';
    doc.error = cause instanceof Error && /^(资料|已配置|向量服务)/.test(cause.message) ? cause.message : '资料索引失败，请检查向量服务连接后重试';
    doc.updatedAt = timestamp();
  } finally {
    if (jobs.get(doc.id) === controller) jobs.delete(doc.id);
  }
  if (alive()) await save();
}

export function cancelIndex(id: string) { jobs.get(id)?.abort(); jobs.delete(id); }

function terms(text: string) {
  const words = (text.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]{2,}/g) || []).flatMap(word => /^[\u4e00-\u9fff]+$/.test(word) ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word]);
  const stop = new Set(['这个', '那个', '什么', '怎么', '如何', '是否', '可以', '一下', '请问', '分析', '数据', '根据', '我们', '进行', '哪些', '说明']);
  return [...new Set(words.filter(word => !stop.has(word)))];
}

export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return -1;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : -1;
}

export async function retrieve(projectId: string, question: string, enabled = true): Promise<Retrieval> {
  if (!enabled) return { mode: 'off', sources: [], notice: '本次未引用业务资料' };
  const documents = db().knowledge.filter(doc => doc.projectId === projectId && doc.status === 'ready');
  if (!documents.length) return { mode: retrievalMode(), sources: [], notice: '当前项目没有可用资料，仅依据计算结果解读' };
  const config = embeddingConfig();
  const eligible = config ? documents.filter(doc => doc.mode === 'vector' && doc.signature === config.signature) : documents;
  if (config && !eligible.length) return { mode: 'vector', sources: [], notice: '资料索引与当前向量模型不一致，请到业务资料页重新索引' };
  const query = config ? (await embed([question], config))[0] : undefined;
  const q = terms(question);
  const candidates = eligible.filter(doc => db().knowledge.includes(doc) && doc.status === 'ready').flatMap(doc => doc.chunks.map(chunk => ({ doc, chunk })));
  const counts = new Map(q.map(term => [term, candidates.filter(x => x.chunk.text.toLowerCase().includes(term) || x.doc.name.toLowerCase().includes(term)).length]));
  const scored = candidates.map(item => {
    const text = `${item.doc.name}\n${item.chunk.text}`.toLowerCase();
    const score = query ? cosine(query, item.chunk.vector || []) : q.reduce((sum, term) => sum + (text.includes(term) ? Math.log(1 + candidates.length / (1 + (counts.get(term) || 0))) : 0), 0);
    return { ...item, score };
  }).filter(x => x.score > (query ? 0.3 : 0)).sort((a, b) => b.score - a.score);
  const sources = scored.slice(0, 3).map((x, index) => ({ id: `S${index + 1}`, documentId: x.doc.id, name: x.doc.name, chunk: x.chunk.index, text: x.chunk.text, score: Math.round(x.score * 1000) / 1000 }));
  return { mode: config ? 'vector' : 'keyword', sources, notice: sources.length ? '资料仅作解释依据，不会自动修改已确认的计算口径' : '未检索到足够相关的资料，仅依据计算结果解读' };
}
