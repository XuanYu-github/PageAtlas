<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {fade, fly} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose} from '../icons';

  export let show: boolean;

  const dispatch = createEventDispatcher();

  let text = '';

  function handleImport() {
    if (!text.trim()) return;
    dispatch('import', {text: text.trim()});
    text = '';
  }

  function handleClose() {
    text = '';
    dispatch('close');
  }
</script>

{#if show}
  <div
    class="fixed inset-0 bg-[rgba(57,35,22,0.58)] backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
    transition:fade={{duration: 150}}
    role="button"
    tabindex="0"
    aria-label="Close paste dialog"
    on:click|self={handleClose}
    on:keydown={(e) => (e.key === 'Escape') && handleClose()}
  >
    <div
      class="panel-paper p-6 w-[95%] md:w-[85%] max-w-lg max-h-[90vh] flex flex-col"
      transition:fly={{y: 20, duration: 200}}
    >
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-xl md:text-2xl font-bold">{$t('manual_toc.title')}</h2>
        <button
          on:click={handleClose}
          class="farm-icon-button"
          aria-label="Close modal"
        >
          <PixelIcon size={18} pixels={iconClose} />
        </button>
      </div>

      <p class="text-sm text-[color:var(--pa-ink)] mb-3">{$t('manual_toc.instruction')}</p>

      <textarea
        bind:value={text}
        placeholder={$t('manual_toc.placeholder')}
        class="w-full h-60 p-3 text-[16px] leading-7 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-pixel-ui text-[color:var(--pa-bark)] placeholder:text-[color:rgba(91,67,48,0.68)] border-2 border-[color:var(--pa-bark)] rounded"
      ></textarea>

      <div class="flex justify-end gap-3 mt-4">
        <button
          on:click={handleClose}
          class="btn farm-btn-water px-4 py-2"
        >
          {$t('manual_toc.cancel')}
        </button>
        <button
          on:click={handleImport}
          disabled={!text.trim()}
          class="btn px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {$t('manual_toc.parse')}
        </button>
      </div>
    </div>
  </div>
{/if}
