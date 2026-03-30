<script lang="ts">
  import {t} from 'svelte-i18n';
  import PixelIcon from './icons/PixelIcon.svelte';
  import PixelButton from './pixel/PixelButton.svelte';
  import PixelCard from './pixel/PixelCard.svelte';
  import {iconUpload} from './icons';

  export let isDragging: boolean;
  export let hasInstance: boolean;
</script>

<div
  class="w-full h-full rounded-lg select-none text-center cursor-pointer transition-colors duration-200
  {hasInstance ? 'pointer-events-none' : ''} "
  class:pointer-events-auto={isDragging}
  class:bg-[rgba(247,213,111,0.22)]={isDragging}
>
  {#if !hasInstance || isDragging}
    <div class="absolute inset-0 flex flex-col items-center justify-center p-4 text-[color:var(--pa-ink-soft)]">
      {#if isDragging}
        <p class="text-xl md:text-2xl font-bold text-[color:var(--pa-bark)] font-pixel-heading">{$t('dropzone.drop_here')}</p>
      {:else}
        <PixelCard variant="field" class="w-24 h-24 flex items-center justify-center mb-5">
          <PixelIcon
            size={44}
            pixels={iconUpload}
            color="var(--pa-forest)"
          />
        </PixelCard>
        <div class="pixel-reading-surface px-4 py-4 w-full max-w-[360px] flex flex-col items-center">
          <h3 class="text-[20px] md:text-[24px] text-[color:var(--pa-bark)] mb-3 text-center">{$t('dropzone.title')}</h3>
          <p class="text-base max-w-sm leading-7 text-center">{$t('dropzone.subtitle')}</p>
          <PixelButton
            variant="leaf"
            class="mt-5 px-6 py-3"
          >
            {$t('dropzone.btn_select')}
          </PixelButton>
        </div>
      {/if}
    </div>
  {/if}
</div>
