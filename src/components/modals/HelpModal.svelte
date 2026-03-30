<script lang="ts">
  import {base} from '$app/paths';
  import {fade, fly} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose, iconSend} from '../icons';

  export let showHelpModal: boolean;

  const email = 'anigiscur@gmail.com';
  let copied = false;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };
</script>

{#if showHelpModal}
  <div
    class="fixed inset-0 bg-[rgba(57,35,22,0.58)] backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
    transition:fade={{duration: 150}}
    role="button"
    tabindex="0"
    aria-label={$t('help_modal.close')}
    on:click|self={() => (showHelpModal = false)}
    on:keydown={(e) => (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') && (showHelpModal = false)}
  >
    <div
      class="panel-paper pixel-reading-surface p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto"
      transition:fly={{y: 20, duration: 200}}
    >
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <h2 class="text-[20px] md:text-[24px]">{$t('help_modal.title')}</h2>

          <span class="font-pixel-ui font-bold border-l-2 border-black pl-4 ml-1 hidden sm:inline-block">
            {$t('help_modal.feedback')}
            <PixelIcon size={18} pixels={iconSend} class="inline-block font-bold mr-1" />
          </span>

          <button
            on:click={copyEmail}
            class={`btn text-xs ${copied ? 'farm-btn-secondary cursor-default' : ''}`}
            title={$t('help_modal.copy_email')}
          >
            {#if copied}
              <span>{$t('help_modal.copied')}</span>
            {:else}
              <span>{email}</span>
            {/if}
          </button>
        </div>

        <button
          on:click={() => (showHelpModal = false)}
          class="absolute top-4 right-4 md:relative md:top-auto md:right-auto farm-icon-button"
          aria-label={$t('help_modal.close_button')}
        >
          <PixelIcon size={18} pixels={iconClose} />
        </button>
      </div>

      <div class="flex flex-col gap-6">
        <video
          src={`${base}/videos/demo.mp4`}
          controls
          loop
          autoplay
          muted
          class="w-full h-auto border-[4px] border-[color:var(--pa-bark)] shadow-[var(--pa-shadow-pixel)]"
        ></video>
      </div>
    </div>
  </div>
{/if}
