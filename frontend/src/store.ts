import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { themeColor } from './palette';  
 
import type { ChartConfig, Dataset, Project } from './types';

 
const saved = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

 
export const useWorkspace = defineStore('workspace', () => {
   
   
  const projectId = ref(saved('workbench-project', ''));
   
  const datasetId = ref(saved('workbench-dataset', ''));
   
  const chartDraft = ref<ChartConfig>(
    saved('workbench-chart', {
      chartType: 'bar',  
      dimension: '',  
      metric: '',  
      aggregate: 'sum',  
      title: '新图表',
      showLegend: true,  
      showLabels: false,  
      color: '#e1829d',
      limit: 20,  
      filterField: '',   
      filterValue: '',  
      sort: 'desc',  
    }),
  );
  const projects = ref<Project[]>([]);
  const datasets = ref<Dataset[]>([]);
   
  chartDraft.value.color = themeColor(chartDraft.value.color);
  function syncOwner(userId: string) {
    if (localStorage.getItem('workbench-owner') === userId) return;
    projectId.value = '';
    datasetId.value = '';
    chartDraft.value = {
      ...chartDraft.value,
      title: '新图表', dimension: '', metric: '', filterField: '', filterValue: '',
    };
    localStorage.setItem('workbench-owner', userId);
  }
   
  watch(projectId, (v) => localStorage.setItem('workbench-project', JSON.stringify(v)));
  watch(datasetId, (v) => localStorage.setItem('workbench-dataset', JSON.stringify(v)));
  watch(chartDraft, (v) => localStorage.setItem('workbench-chart', JSON.stringify(v)), { deep: true });
  return { projectId, datasetId, chartDraft, projects, datasets, syncOwner };
});
