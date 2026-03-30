<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {fade} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import PixelIcon from './icons/PixelIcon.svelte';
  import PixelButton from './pixel/PixelButton.svelte';
  import PixelToolbar from './pixel/PixelToolbar.svelte';
  import {iconDownload, iconEye, iconPencil, iconUpload} from './icons';

  export let isPreviewLoading: boolean;
  export let isPreviewMode: boolean;
  export let originalPdfInstance: any;
  export let doc: any;

  const dispatch = createEventDispatcher();
</script>

<PixelToolbar class="relative z-20 mt-auto w-full flex-col md:flex-row md:justify-end">
  <PixelButton
    variant="leaf"
    class="w-full md:w-auto min-w-[144px]"
    on:click={() => dispatch('triggerUpload')}
    title={$t('tooltip.upload_new')}
  >
    <PixelIcon size={18} pixels={iconUpload} />
    {$t('btn.upload_new')}
  </PixelButton>
  <PixelButton
    class="w-full md:w-auto min-w-[128px]"
    on:click={() => dispatch('togglePreview')}
    disabled={!originalPdfInstance || isPreviewLoading}
    title={isPreviewMode
      ? $t('tooltip.switch_edit')
      : $t('tooltip.switch_preview')}
  >
    {#key isPreviewLoading.toString() + isPreviewMode.toString()}
      <div
        class="flex gap-2 items-center justify-center"
        in:fade={{duration: 150}}
      >
        {#if isPreviewLoading}
          <div class="pixel-spinner"></div>
          {$t('btn.loading')}
        {:else if isPreviewMode}
          <PixelIcon size={18} pixels={iconPencil} />
          {$t('btn.select_grid')}
        {:else}
          <PixelIcon size={18} pixels={iconEye} />
          {$t('btn.preview')}
        {/if}
      </div>
    {/key}
  </PixelButton>
  <PixelButton
    variant="night"
    class="w-full md:w-auto min-w-[144px]"
    on:click={() => dispatch('export')}
    disabled={!doc}
  >
    <PixelIcon size={18} pixels={iconDownload} />
    {$t('btn.generate_pdf')}
  </PixelButton>
</PixelToolbar>
