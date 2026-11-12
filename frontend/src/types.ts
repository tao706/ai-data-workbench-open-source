 
export type Field = {
  name: string;  
  alias?: string;  
  included?: boolean;  
  type: 'number' | 'text' | 'date';  
  missing: number;  
  missingRate: number;  
  unique: number;  
  min: unknown;  
  max: unknown;  
};

 
export type Project = {
  id: string;  
  name: string;  
  description: string;  
  createdAt: string;  
};

 
export type Dataset = {
  id: string;  
  projectId: string;  
  name: string;  
  originalName: string;  
  rows: number;  
  columns: number;  
  fields: Field[];  
  duplicates: number;  
  version: number;  
  createdAt: string;  
};

 
export type Task = {
  id: string;  
  name: string;  
  type: string;  
  status: string;  
  progress: number;  
  result?: unknown;  
  error?: string;  
  createdAt: string;  
};

 
export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'table';

 
export type ChartConfig = {
  chartType: ChartType;  
  dimension: string;  
  metric: string;  
  aggregate: 'count' | 'sum' | 'mean' | 'min' | 'max';  
  title: string;  
  showLegend: boolean;  
  showLabels: boolean;  
  color: string;  
  colorMode?: 'palette' | 'single';  
  limit: number;  
  filterField?: string;  
  filterValue?: string;  
  sort?: 'asc' | 'desc';  
};

 
export type SavedChart = {
  id: string;  
  projectId: string;  
  datasetId: string;  
  name: string;  
  config: ChartConfig;  
  datasetVersion: number;  
};

 
export type Report = {
  id: string;  
  name: string;  
  projectId: string;  
   
  sections: {
    type: 'text' | 'chart';
    title: string;
    content?: string;
    chartId?: string;
  }[]; 
  createdAt: string;  
};
