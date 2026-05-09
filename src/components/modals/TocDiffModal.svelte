<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {fade, fly} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose} from '../icons';

  export let show: boolean;

  interface DiffRow {
    oldText: string | null;
    newText: string | null;
    oldPage: number | null;
    newPage: number | null;
  }

  export let diffRows: DiffRow[] = [];

  const dispatch = createEventDispatcher();

  function handleOverwrite() {
    dispatch('overwrite');
  }

  function handleReimport() {
    dispatch('reimport');
  }

  function handleClose() {
    dispatch('close');
  }

  function pageBadge(page: number | null): string {
    return page != null ? `p.${page}` : '';
  }
</script>

{#if show}
  <div
    class="fixed inset-0 bg-[rgba(57,35,22,0.58)] backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
    transition:fade={{duration: 150}}
    role="button"
    tabindex="0"
    aria-label="Close diff dialog"
    on:click|self={handleClose}
    on:keydown={(e) => (e.key === 'Escape') && handleClose()}
  >
    <div
      class="panel-paper p-6 w-[95%] md:w-[90%] max-w-6xl max-h-[90vh] flex flex-col"
      transition:fly={{y: 20, duration: 200}}
    >
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-xl md:text-2xl font-bold">{$t('toc_diff.title')}</h2>
        <button
          on:click={handleClose}
          class="farm-icon-button"
          aria-label="Close modal"
        >
          <PixelIcon size={18} pixels={iconClose} />
        </button>
      </div>

      <div class="flex gap-2 mb-2 text-sm font-bold">
        <div class="flex-1 px-3 py-2 bg-[#fff0f0] border border-red-200 rounded">
          {$t('toc_diff.old_label')}
        </div>
        <div class="flex-1 px-3 py-2 bg-[#f0fff0] border border-green-200 rounded">
          {$t('toc_diff.new_label')}
        </div>
      </div>

      <div class="flex-1 overflow-auto border-2 border-[color:var(--pa-bark)] rounded bg-white">
        {#each diffRows as row, i}
          <div class="flex border-b border-gray-100 min-h-[28px] leading-7">
            <!-- Row number -->
            <span class="w-8 text-right pr-1 text-gray-400 select-none shrink-0 pt-[2px]">{i + 1}</span>
            <!-- Old marker -->
            <span class="w-6 text-center font-bold shrink-0 pt-[2px] {row.oldText && !row.newText ? 'text-red-500' : 'text-gray-300'}">
              {row.oldText && !row.newText ? '-' : ' '}
            </span>
            <!-- Old content -->
            <span class="flex-1 min-w-0 pl-1 pr-2 whitespace-pre-wrap break-all text-sm pt-[2px] {row.oldText && !row.newText ? 'bg-red-50 text-red-700' : ''}">
              {#if row.oldText}
                <span>{row.oldText}</span>
                <span class="text-gray-400 text-xs ml-1">{pageBadge(row.oldPage)}</span>
              {:else}
                <span class="text-gray-300 italic">&mdash;</span>
              {/if}
            </span>
            <!-- Separator -->
            <span class="w-[2px] bg-gray-200 shrink-0"></span>
            <!-- New marker -->
            <span class="w-6 text-center font-bold shrink-0 pt-[2px] {!row.oldText && row.newText ? 'text-green-600' : 'text-gray-300'}">
              {!row.oldText && row.newText ? '+' : ' '}
            </span>
            <!-- New content -->
            <span class="flex-1 min-w-0 pl-1 pr-2 whitespace-pre-wrap break-all text-sm pt-[2px] {!row.oldText && row.newText ? 'bg-green-50 text-green-700' : ''}">
              {#if row.newText}
                <span>{row.newText}</span>
                <span class="text-gray-400 text-xs ml-1">{pageBadge(row.newPage)}</span>
              {:else}
                <span class="text-gray-300 italic">&mdash;</span>
              {/if}
            </span>
          </div>
        {/each}
      </div>

      <div class="flex gap-4 mt-2 text-xs text-gray-500">
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-3 rounded-sm bg-red-50 border border-red-200"></span>
          {$t('toc_diff.removed')}
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-3 rounded-sm bg-green-50 border border-green-200"></span>
          {$t('toc_diff.added')}
        </span>
      </div>

      <div class="flex justify-end gap-3 mt-4 pt-3 border-t border-[color:var(--pa-bark)]">
        <button
          on:click={handleReimport}
          class="btn farm-btn-water px-4 py-2"
        >
          {$t('toc_diff.reimport')}
        </button>
        <button
          on:click={handleOverwrite}
          class="btn px-4 py-2"
        >
          {$t('toc_diff.overwrite')}
        </button>
      </div>
    </div>
  </div>
{/if}
