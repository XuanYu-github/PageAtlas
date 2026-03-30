<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import LanguageSwitch from '../components/LanguageSwitch.svelte';
  import {openExternalUrl} from '$lib/utils/open-external';
  import PixelIcon from './icons/PixelIcon.svelte';
  import PixelButton from './pixel/PixelButton.svelte';
  import PixelPanel from './pixel/PixelPanel.svelte';
  import PixelToolbar from './pixel/PixelToolbar.svelte';
  import {iconGithub, iconQuestion} from './icons';

  const dispatch = createEventDispatcher();
  const GITHUB_URL = 'https://github.com/XuanYu-github/PageAtlas';

  function handleOpenGithub() {
    void openExternalUrl(GITHUB_URL);
  }
</script>

<PixelPanel variant="wood" class="p-4 md:p-5">
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-center text-center">
      <div class="min-w-0">
        <h1 class="text-[28px] md:text-[32px] leading-[1.2] tracking-[0.02em] break-words">PageAtlas</h1>
      </div>
    </div>

    <PixelPanel variant="dialog" class="p-3 pixel-reading-surface">
      <p class="farm-subtitle max-w-none text-[color:var(--pa-ink)] pr-1 text-center">
        {$t('header.subtitle')}
      </p>
    </PixelPanel>

    <PixelToolbar class="items-center justify-between bg-transparent border-0 shadow-none p-0">
      <div class="flex flex-wrap items-center gap-2">
        <PixelButton
          variant="leaf"
          size="sm"
          on:click={() => dispatch('openhelp')}
          title={$t('header.help')}
          aria-label={$t('header.help')}
        >
          <PixelIcon size={18} pixels={iconQuestion} label="Help" />
          <span>{$t('header.help')}</span>
        </PixelButton>
      </div>

      <div class="ml-auto flex items-center gap-2 max-w-full">
        <button
          type="button"
          class="farm-icon-button"
          title={$t('header.github')}
          aria-label={$t('header.github_aria')}
          on:click={handleOpenGithub}
        >
          <PixelIcon size={20} pixels={iconGithub} label="GitHub" />
        </button>
        <LanguageSwitch />
      </div>
    </PixelToolbar>
  </div>
</PixelPanel>
