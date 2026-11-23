export type KnowledgeDocument = {
  id: string; projectId: string; name: string; characters: number; chunkCount: number;
  status: 'indexing' | 'ready' | 'failed'; mode: 'vector' | 'keyword'; error?: string;
  createdAt: string; updatedAt: string;
};
export type Citation = { id: string; documentId: string; name: string; chunk: number; text: string; score: number };
export type Retrieval = { mode: 'vector' | 'keyword' | 'off'; sources: Citation[]; notice: string };
export type KnowledgeList = { mode: 'vector' | 'keyword'; documents: KnowledgeDocument[] };
export const modeLabel = (mode: string) => mode === 'vector' ? '向量检索' : mode === 'keyword' ? '关键词检索' : '未引用资料';
