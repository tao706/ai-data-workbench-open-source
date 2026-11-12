<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useId } from 'vue';
defineOptions({ inheritAttrs: false });
const props=defineProps<{modelValue?:string|number; modelModifiers?:{number?:boolean}; disabled?:boolean}>();
const emit=defineEmits(['update:modelValue','change']);
type Item={value:string;label:string;disabled:boolean};
const source=ref<HTMLSelectElement>(),trigger=ref<HTMLButtonElement>(),menu=ref<HTMLElement>();
const items=ref<Item[]>([]),open=ref(false),active=ref(0),position=ref<Record<string,string>>({});
const id=useId();
const selected=computed(()=>items.value.find(i=>i.value===String(props.modelValue??'')));
function sync(){const next=Array.from(source.value?.options||[]).map(o=>({value:o.value,label:o.textContent||'',disabled:o.disabled}));if(JSON.stringify(next)!==JSON.stringify(items.value))items.value=next;}
function place(){const r=trigger.value?.getBoundingClientRect();if(!r)return;const below=window.innerHeight-r.bottom-12;const above=below<170&&r.top>below;position.value={left:`${Math.max(8,Math.min(r.left,window.innerWidth-r.width-8))}px`,width:`${Math.min(r.width,window.innerWidth-16)}px`,maxHeight:`${Math.max(80,Math.min(280,above?r.top-16:below))}px`,...(above?{bottom:`${window.innerHeight-r.top+6}px`}:{top:`${r.bottom+6}px`})};}
async function toggle(){if(props.disabled)return;open.value=!open.value;if(open.value){sync();active.value=Math.max(0,items.value.findIndex(i=>i.value===String(props.modelValue??'')));place();await nextTick();reveal();}}
function reveal(){menu.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({block:'nearest'});}
function choose(index:number){const item=items.value[index];if(!item||item.disabled)return;const value=props.modelModifiers?.number?Number(item.value):item.value;open.value=false;if(value!==props.modelValue){emit('update:modelValue',value);emit('change',new Event('change'));}trigger.value?.focus();}
function move(step:number){for(let i=0;i<items.value.length;i++){active.value=(active.value+step+items.value.length)%items.value.length;if(!items.value[active.value].disabled)break;}void nextTick(reveal);}
function key(event:KeyboardEvent){if(event.key==='Tab'){open.value=false;return;}if(event.key==='Escape'){open.value=false;event.preventDefault();return;}if(['ArrowDown','ArrowUp','Enter',' ' ,'Home','End'].includes(event.key)){event.preventDefault();if(!open.value){void toggle();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp')move(event.key==='ArrowDown'?1:-1);else if(event.key==='Home'||event.key==='End'){active.value=event.key==='Home'?0:items.value.length-1;void nextTick(reveal);}else choose(active.value);}else if(event.key.length===1){const index=items.value.findIndex(i=>!i.disabled&&i.label.toLowerCase().startsWith(event.key.toLowerCase()));if(index>=0){if(!open.value)void toggle();active.value=index;void nextTick(reveal);}}}
function outside(event:PointerEvent){if(!trigger.value?.contains(event.target as Node)&&!menu.value?.contains(event.target as Node))open.value=false;}
function scroll(event:Event){if(open.value&&!menu.value?.contains(event.target as Node))place();}
onMounted(()=>{sync();document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',scroll,true)});
onUpdated(sync);
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',scroll,true)});
</script>
<template>
  <div class="app-select">
    <select ref="source" :value="modelValue" tabindex="-1" aria-hidden="true" style="display:none"><slot/></select>
    <button ref="trigger" v-bind="$attrs" type="button" class="select-trigger" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="`${id}-list`" :aria-activedescendant="open?`${id}-${active}`:undefined" @click="toggle" @keydown="key"><span>{{selected?.label||'请选择'}}</span><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
    <Teleport to="body"><div v-if="open" :id="`${id}-list`" ref="menu" role="listbox" :aria-label="String($attrs['aria-label']||'选择选项')" class="select-popup" :style="position"><div v-for="(item,index) in items" :id="`${id}-${index}`" :key="`${item.value}-${index}`" role="option" :data-index="index" :aria-selected="item.value===String(modelValue??'')" :aria-disabled="item.disabled" :class="{selected:item.value===String(modelValue??''),highlighted:index===active,disabled:item.disabled}" @pointermove="active=index" @pointerdown.prevent @click="choose(index)"><span>{{item.label}}</span><span v-if="item.value===String(modelValue??'')" aria-hidden="true">✓</span></div></div></Teleport>
  </div>
</template>
<style>
.app-select{position:relative;min-width:0;width:100%}.select-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:40px;padding:10px 12px;text-align:left;border:1px solid #ccd8e4;border-radius:9px;background:linear-gradient(110deg,#fdf5ef,#fbf6f9);color:#456398;font-size:12px;font-weight:500;cursor:pointer}.select-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.select-trigger svg{flex-shrink:0}.select-trigger:hover{border-color:#b86885}.select-trigger:focus-visible,.select-trigger[aria-expanded=true]{outline:none;border-color:#b86885;box-shadow:0 0 0 3px #fadadd55}.select-trigger:disabled{opacity:.5;cursor:not-allowed}.select-popup{position:fixed;z-index:3000;overflow:auto;overscroll-behavior:contain;padding:5px;border:1px solid #edcfd3;border-radius:10px;box-shadow:0 12px 35px #465d8224;background:#fff;scrollbar-width:thin;scrollbar-color:#f4a7b9 transparent;font:500 12px/1.5 'Segoe UI','Microsoft YaHei',sans-serif}.select-popup [role=option]{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:2px 0;padding:8px 10px;border-radius:6px;color:#456398;cursor:pointer;overflow-wrap:anywhere}.select-popup [role=option].selected{background:#fce9e7;color:#96506f;font-weight:600}.select-popup [role=option].highlighted{background:#fadadd;color:#80435e}.select-popup [role=option].disabled{opacity:.45;cursor:not-allowed}
</style>
