<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  initialValue?: string;
  inputLabel?: string;
  danger?: boolean;
  busy?: boolean;
  errorMessage?: string;
}>(), { confirmLabel: '确定', initialValue: '', danger: false, busy: false });
const emit = defineEmits<{ cancel: []; confirm: [value: string] }>();
const form = reactive({ value: '' });
const formRef = ref<FormInstance>();
const inputRef = ref<InstanceType<typeof ElInput>>();
const rules: FormRules = { value: [
  { required: true, whitespace: true, message: '请输入名称', trigger: 'blur' },
  { max: 100, message: '名称不能超过 100 个字符', trigger: 'blur' },
] };
watch(() => props.open, async open => {
  if (!open) return;
  form.value = props.initialValue;
  await nextTick();
  formRef.value?.clearValidate();
  if (props.inputLabel) { inputRef.value?.focus(); inputRef.value?.select(); }
});
async function submit() {
  if (props.busy) return;
  if (props.inputLabel && !await formRef.value?.validate().catch(() => false)) return;
  emit('confirm', form.value.trim());
}
</script>

<template>
  <ElDialog :model-value="open" class="workbench-dialog" width="min(440px, calc(100vw - 32px))" :show-close="false" :close-on-click-modal="!busy" :close-on-press-escape="!busy" align-center @update:model-value="value => { if (!value) emit('cancel') }">
    <template #header><div class="action-header"><span class="action-symbol" :class="{ danger }">{{ danger ? '!' : '✎' }}</span><h2>{{ title }}</h2></div></template>
    <p class="action-description">{{ description }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <ElForm v-if="inputLabel" ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <ElFormItem :label="inputLabel" prop="value"><ElInput ref="inputRef" v-model="form.value" maxlength="100" show-word-limit @keyup.enter="submit"/></ElFormItem>
    </ElForm>
    <template #footer><div class="action-buttons"><ElButton :disabled="busy" @click="emit('cancel')">取消</ElButton><ElButton :type="danger ? 'danger' : 'primary'" :loading="busy" @click="submit">{{ confirmLabel }}</ElButton></div></template>
  </ElDialog>
</template>

<style scoped>
.action-header{display:flex;align-items:center;gap:12px}.action-header h2{margin:0;color:#293a52;font-size:20px;font-weight:700}.action-symbol{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#bfd7ea66;color:#456398;font-size:22px;font-weight:700}.action-symbol.danger{background:#fadadd;color:#a34a68}.action-description{margin:4px 0 20px;color:#697b94;font-size:13px;line-height:1.8}.action-buttons{display:flex;justify-content:flex-end;gap:8px}
</style>
