<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElPagination, ElTable, ElTableColumn } from 'element-plus';
import { api, messageOf } from '../api';
import { useWorkspace } from '../store';
import VirtualTable from '../components/VirtualTable.vue';  
import ActionDialog from '../components/ActionDialog.vue';  
import type { Dataset, Field } from '../types';

const route = useRoute();   
const ws = useWorkspace();  
const d = ref<Dataset>();  
const rows = ref<Record<string, unknown>[]>([]);  
const versions = ref<any[]>([]);  
const tab = ref('preview');  
const error = ref('');  
const notice = ref('');  
const offset = ref(0);  
const search = ref('');  
const busy = ref(false);  
const total = ref(0);  
const fieldPage = ref(1);  
const versionPage = ref(1);  
const listPageSize = 10;  
const restoreVersion = ref<number | null>(null);  

 
const visibleFields = computed(
   
  () => d.value?.fields.filter((f) => f.name.toLowerCase().includes(search.value.toLowerCase())) || [],
);

 
const pageFields = computed(
   
  () => d.value?.fields.slice((fieldPage.value - 1) * listPageSize, fieldPage.value * listPageSize) || [],
);

 
const pageVersions = computed(() =>
   
  versions.value.slice((versionPage.value - 1) * listPageSize, versionPage.value * listPageSize),
);

 
async function load() {
  busy.value = true;  
  try {
     
    d.value = await api('get', `/datasets/${route.params.id}`);
     
    d.value!.fields.forEach((field) => {
     
      if (field.included === undefined) field.included = true;
    });
     
    ws.datasetId = d.value!.id;
     
    versions.value = await api('get', `/datasets/${route.params.id}/versions`);
    await page();  
  } catch (e) {
    error.value = messageOf(e);
  } finally {
    busy.value = false;  
  }
}

 
async function page() {
   
  const result = await api<any>('get', `/datasets/${route.params.id}/preview?offset=${offset.value}&limit=500`);
  rows.value = result.rows;  
  total.value = result.total;  
}

 
async function updateField(field: Field) {
  try {
     
    await api('patch', `/datasets/${route.params.id}/fields/${encodeURIComponent(field.name)}`, {
      alias: field.alias || '',  
      included: field.included !== false,  
    });
    notice.value = `字段「${field.name}」已更新`;
  } catch (e) {
    error.value = messageOf(e);
  }
}

 
async function restore(version: number) {
  try {
     
    await api('post', `/datasets/${route.params.id}/restore`, { version });
    restoreVersion.value = null;  
    notice.value = `已从 V${version} 恢复，并生成新版本`;
    await load();  
  } catch (e) {
    error.value = messageOf(e);
  }
}
onMounted(load);  
</script>

<template>
  <div class="stack">
    <div class="page-heading">
      <div>
        <h2>{{ d?.name || '数据集详情' }}</h2>
        <p>{{ d?.originalName }} · {{ d?.rows }} 行 × {{ d?.columns }} 列 · V{{ d?.version }}</p>
      </div>
      <router-link to="/studio" class="button primary">用此数据集创建图表 →</router-link>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="notice" class="success">{{ notice }}</div>
     
    <div class="grid-4">
      <div
        v-for="item in [
          ['总行数', d?.rows || 0],
          ['字段数量', d?.columns || 0],
          ['重复行', d?.duplicates || 0],
          ['当前版本', d?.version || 0],
        ]"
        :key="String(item[0])"
        class="card stat-card"
      >
        <div class="stat-label">{{ item[0] }}</div>
        <div class="stat-number">{{ item[1] }}</div>
      </div>
    </div>

     
    <div class="card card-pad">
      <div class="tabs">
        <button
          v-for="item in [
            ['preview', '数据预览'],
            ['fields', '字段字典'],
            ['versions', '历史版本'],
          ]"
          :key="item[0]"
          class="tab"
          :class="{ active: tab === item[0] }"
          @click="tab = String(item[0])"
        >
          {{ item[1] }}
        </button>
      </div>
      <div v-if="busy" class="empty">正在加载…</div>

       
      <template v-else-if="tab === 'preview'">
        <input v-model="search" class="control search" placeholder="搜索字段" style="margin-bottom: 14px" />
         
        <VirtualTable
          :rows="rows" 
          :fields="visibleFields.filter((f) => f.included !== false).map((f) => f.name)"
          :height="430"
        />
         
        <ElPagination
          :current-page="Math.floor(offset / 500) + 1"
          :page-size="500"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="
            offset = ($event - 1) * 500;
            page(); // 加载新分页数据
          "
        />

        
      </template>
      <div v-else-if="tab === 'fields'">
        <ElTable :data="pageFields" stripe table-layout="auto" empty-text="暂无字段" style="width: 100%">
          <ElTableColumn prop="name" label="字段" min-width="140" />
          <ElTableColumn label="别名" min-width="140">
             
            <template #default="{ row }">
              <input v-model="row.alias" class="control" style="width: 130px" placeholder="可选别名" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="参与预览" min-width="100">
            <template #default="{ row }">
              <input v-model="row.included" type="checkbox" :true-value="true" :false-value="false" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="类型" min-width="80">
            <template #default="{ row }"><span class="badge">{{ row.type }}</span></template>
          </ElTableColumn>
          <ElTableColumn label="缺失率" min-width="90">
            <template #default="{ row }">{{ row.missingRate }}%</template>
          </ElTableColumn>
          <ElTableColumn prop="unique" label="唯一值" min-width="80" />
          <ElTableColumn label="范围" min-width="180">
            <template #default="{ row }">{{ row.min ?? '—' }} ～ {{ row.max ?? '—' }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" min-width="80">
            <template #default="{ row }">
              <button class="button ghost" @click="updateField(row as Field)">保存</button>
            </template>
          </ElTableColumn>
        </ElTable>
        <ElPagination
          v-if="(d?.fields.length || 0) > listPageSize"
          :current-page="fieldPage"
          :page-size="listPageSize"
          :total="d?.fields.length || 0"
          layout="prev, pager, next, total"
          background
          @current-change="fieldPage = $event"
        />
      </div>

        
      <div v-else>
        <ElTable :data="pageVersions" stripe table-layout="auto" empty-text="暂无历史版本" style="width: 100%">
          <ElTableColumn label="版本" min-width="70">
            <template #default="{ row }">V{{ row.version }}</template>
          </ElTableColumn>
          <ElTableColumn prop="rows" label="行数" min-width="80" />
          <ElTableColumn label="生成时间" min-width="175">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
          </ElTableColumn>
          <ElTableColumn label="说明" min-width="200">
            <template #default="{ row }">{{
              row.restoredFrom
                ? `从 V${row.restoredFrom} 恢复`
                : row.rules?.map((r: any) => r.operation).join('、') || '原始数据'
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" min-width="150">
            <template #default="{ row }">
              <button class="button ghost" :disabled="row.version === d?.version" @click="restoreVersion = row.version">
                恢复为新版本
              </button>
            </template>
          </ElTableColumn>
        </ElTable>
        <ElPagination
          v-if="versions.length > listPageSize"
          :current-page="versionPage"
          :page-size="listPageSize"
          :total="versions.length"
          layout="prev, pager, next, total"
          background
          @current-change="versionPage = $event"
        />
      </div>
    </div>
    <ActionDialog
      :open="restoreVersion !== null"
      title="恢复历史版本"
      :description="`将 V${restoreVersion} 的数据恢复为新版本？当前版本会保留，可随时追溯。`"
      confirm-label="确认恢复"
      :busy="busy"
      @cancel="restoreVersion = null"
      @confirm="restore(restoreVersion!)"
    />
  </div>
</template>
