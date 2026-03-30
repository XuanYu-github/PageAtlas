<script lang="ts">
  import {fade, fly} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconAlert, iconClose, iconDownload, iconSparkle} from '../icons/index';

  export let showUpdateModal: boolean = false;
  export let updateData: {version: string; body: string; date?: string} | null = null;

  export let onUpdate: () => Promise<void>;
  export let onCancel: () => void;

  let isUpdating = false;
  let errorMessage: string | null = null;

  const handleUpdateClick = async () => {
    if (isUpdating) return;

    isUpdating = true;
    errorMessage = null;

    try {
      await onUpdate();
    } catch (e: any) {
      console.error('Update detailed error:', e);

      errorMessage = `Error: ${e.message || JSON.stringify(e)}`;
      isUpdating = false;

      // console.error('Update failed:', e);
      // errorMessage = e.message || 'Download failed. Please check your network connection.';
      // isUpdating = false;
    }
  };

  const handleClose = () => {
    if (isUpdating) return;
    errorMessage = null;
    onCancel();
  };
</script>

{#if showUpdateModal && updateData}
  <div
    class="fixed inset-0 bg-gray-400/90 flex items-center justify-center z-[60] p-4"
    transition:fade={{duration: 150}}
    role="button"
    tabindex="0"
    aria-label={$t('update_modal.close')}
    on:click|self={handleClose}
    on:keydown={(e) => (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') && handleClose()}
  >
    <div
      class="panel-paper pixel-reading-surface p-0 max-w-lg w-full max-h-[85vh] flex flex-col relative overflow-hidden"
      transition:fly={{y: 20, duration: 200}}
    >
      <div class="panel-wood border-b-4 border-black p-5 flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="panel-paper pixel-reading-surface p-2 w-12 h-12 flex items-center justify-center">
            <PixelIcon size={20} pixels={iconSparkle} />
          </div>
          <div>
            <h2 class="text-[20px] font-pixel-heading tracking-tight">{$t('update_modal.title')}</h2>
            <p class="text-xs font-pixel-ui">{$t('update_modal.available', {values: {version: updateData.version}})}</p>
          </div>
        </div>

        {#if !isUpdating}
          <button
            on:click={handleClose}
            class="farm-icon-button w-10 h-10"
          >
            <PixelIcon size={18} pixels={iconClose} />
          </button>
        {/if}
      </div>

      <div class="p-6 overflow-y-auto custom-scrollbar flex-1">
        {#if errorMessage}
          <div
            class="mb-4 panel-paper pixel-reading-surface !bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.04)),linear-gradient(180deg,#e8a38c,#c55c45)] text-[color:var(--pa-white)] p-3 flex items-start gap-3"
            transition:fade
          >
            <PixelIcon class="shrink-0 mt-0.5" size={18} pixels={iconAlert} />
            <div class="text-sm font-bold">
              <p>{$t('update_modal.failed')}</p>
              <p class="font-normal">{errorMessage}</p>
            </div>
          </div>
        {/if}

        <div class="prose prose-sm max-w-none">
          <p class="font-pixel-ui font-bold text-base mb-2">{$t('update_modal.whats_new')}</p>
          <div
            class="panel-paper pixel-reading-surface p-4 text-sm whitespace-pre-wrap leading-relaxed"
          >
            {updateData.body || $t('update_modal.default_body')}
          </div>
        </div>
      </div>

      <div class="p-6 pt-0 mt-auto grid grid-cols-2 gap-4">
        <button
          on:click={handleClose}
          disabled={isUpdating}
          class="btn farm-btn-secondary"
        >
          {$t('update_modal.later')}
        </button>

        <button
          on:click={handleUpdateClick}
          disabled={isUpdating}
          class="btn farm-btn-water"
        >
          {#if isUpdating}
            <div class="pixel-spinner"></div>
            <span>{$t('update_modal.installing')}</span>
          {:else}
            <PixelIcon size={18} pixels={iconDownload} />
            <span>{$t('update_modal.update_now')}</span>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
