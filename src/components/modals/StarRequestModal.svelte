<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { createEventDispatcher } from 'svelte';
  import {openExternalUrl} from '$lib/utils/open-external';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconChat, iconClose, iconGithub, iconStar} from '../icons/index';

  export let show: boolean = false;

  const dispatch = createEventDispatcher();
  const GITHUB_URL = 'https://github.com/XuanYu-github/PageAtlas';

  function close() {
    show = false;
    dispatch('close');
  }

  function handleStar() {
    void openExternalUrl(GITHUB_URL);
    handleDontShow();
  }

  function handleFeedback() {
    void openExternalUrl(`${GITHUB_URL}/issues`);
    close();
  }

  function handleDontShow() {
    localStorage.setItem('pageatlas_hide_star_request', 'true');
    close();
  }
</script>

{#if show}
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
    transition:fade={{ duration: 200 }}
    role="button"
    tabindex="0"
    aria-label="Close star request dialog"
    on:click|self={close}
    on:keydown={(e) => (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') && close()}
  >
    <div
      class="panel-paper pixel-reading-surface p-8 max-w-md w-full relative overflow-hidden"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <button
        on:click={close}
        class="absolute top-3 right-3 farm-icon-button w-10 h-10 z-20"
        title={$t('common.close')}
      >
        <PixelIcon size={18} pixels={iconClose} />
      </button>

      <div class="flex flex-col gap-6 pt-4">
        <div class="space-y-2">
          <div class="farm-kicker mb-2"><PixelIcon size={14} pixels={iconStar} /> {$t('star_request.notice')}</div>
          <h2 class="text-[20px] md:text-[24px] tracking-tight">
            {$t('star_request.title')}
          </h2>
          <p class="pixel-reading-surface p-3 font-medium text-gray-700 leading-relaxed">
            {$t('star_request.body')}
          </p>
        </div>

        <div class="flex flex-col gap-3 mt-2">
          <button
            on:click={handleStar}
            class="btn farm-btn-night text-lg"
          >
            <PixelIcon size={18} pixels={iconGithub} />
            {$t('star_request.btn_star')}
          </button>

          <button
            on:click={handleFeedback}
            class="btn text-lg"
          >
            <PixelIcon size={18} pixels={iconChat} />
            {$t('star_request.btn_feedback')}
          </button>
        </div>

        <div class="flex items-center justify-between mt-4">
          <button
            on:click={close}
            class="text-sm font-bold text-gray-500 hover:text-black transition-colors"
          >
            {$t('star_request.btn_maybe_later')}
          </button>
          <button
            on:click={handleDontShow}
            class="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors underline decoration-2 underline-offset-4"
          >
            {$t('star_request.btn_dont_show')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
