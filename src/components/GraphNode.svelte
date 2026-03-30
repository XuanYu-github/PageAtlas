<script lang="ts">
  import {t} from 'svelte-i18n';
  import {createEventDispatcher} from 'svelte';
  import {CARD_W, CARD_H} from '$lib/utils/graph';
  import PixelIcon from './icons/PixelIcon.svelte';
  import {iconBrain} from './icons';

  import type {KnowledgeGraphNode} from '$lib/utils/graph';

  export let node: KnowledgeGraphNode;
  export let activeNodeId: string | null = null;
  export let isDragTarget = false;
  const dispatch = createEventDispatcher<{jump: number}>();
</script>

<div
  class="absolute pointer-events-auto select-none group flex flex-col items-center justify-center text-center p-3 transition-colors duration-75 dialog-board
        {isDragTarget ? 'z-[100] scale-105' : 'z-20'}
        {activeNodeId === node.id ? 'ring-4 ring-[color:var(--pa-gold-light)]' : 'hover:scale-105'}"
  style="
        left: {node.x}px; 
        top: {node.y}px; 
        width: {CARD_W}px; 
        height: {CARD_H}px;
        cursor: grab;
        "
  role="button"
  tabindex="0"
  on:mousedown
  on:click
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).click();
    }
  }}
>
  <div class="absolute top-2 left-2 w-3 h-3 bg-[color:var(--pa-wood-dark)] border-2 border-[color:var(--pa-bark)]"></div>
  <div class="absolute top-2 right-2 w-3 h-3 bg-[color:var(--pa-wood-dark)] border-2 border-[color:var(--pa-bark)]"></div>

  {#if node.cluster}
    <div class="absolute -top-2 left-1/2 -translate-x-1/2 inventory-slot min-h-0 px-2 py-1 text-[10px] tracking-[0.18em] max-w-[80%] truncate">
      {node.cluster}
    </div>
  {/if}

  {#if node.isInferred}
    <div
      class="absolute top-2 left-2 flex items-center gap-1 text-[9px] text-[color:var(--pa-water-bottom)] uppercase font-bold tracking-widest px-1 rounded"
    >
      <PixelIcon size={10} pixels={iconBrain} />
    </div>
  {/if}

  <div class="font-pixel-ui text-sm leading-5 font-bold text-[color:var(--pa-bark)] break-words line-clamp-3 w-full tracking-wide px-1">
    {node.title}
  </div>

  {#if node.page !== null}
    {@const page = node.page}
    <button
      class="absolute bottom-2 right-2 farm-badge text-[11px]"
      title={$t('knowledge_board.jump_to_page', {values: {page}})}
      on:click|stopPropagation={() => dispatch('jump', page)}
    >
      p.{page}
    </button>
  {/if}
</div>
