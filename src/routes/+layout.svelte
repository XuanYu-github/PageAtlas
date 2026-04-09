<script lang="ts">
  import {base} from '$app/paths';
  import {onMount} from 'svelte';
  import {t} from 'svelte-i18n';
  import DesktopTitleBar from '../components/desktop/DesktopTitleBar.svelte';
  import PixelIcon from '../components/icons/PixelIcon.svelte';
  import {iconEye, iconEyeClosed} from '../components/icons';
	import '../app.css';
  import '../lib/i18n';

	let { children } = $props();
  let isDesktopShell = $state(false);
  let showBackgroundOnly = $state(false);
  let isKnowledgeBoardFullscreen = $state(false);
  const landscapeRevision = '20260409';
  const landscapeUrl = `${base}/pixel-landscape.svg?v=${landscapeRevision}`;

  onMount(() => {
    isDesktopShell = '__TAURI_INTERNALS__' in window;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showBackgroundOnly) {
        showBackgroundOnly = false;
      }
    };
    const handleKnowledgeBoardFullscreen = (event: Event) => {
      const customEvent = event as CustomEvent<{active?: boolean}>;
      isKnowledgeBoardFullscreen = !!customEvent.detail?.active;
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('pageatlas:knowledge-board-fullscreen', handleKnowledgeBoardFullscreen as EventListener);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('pageatlas:knowledge-board-fullscreen', handleKnowledgeBoardFullscreen as EventListener);
    };
  });
</script>

<div
  class="pageatlas-stage"
  class:pageatlas-stage--background-only={showBackgroundOnly}
  style={`--pa-landscape-scene: url('${landscapeUrl}')`}
>
  {#if isDesktopShell}
    <DesktopTitleBar title="PageAtlas" />
  {/if}

  <div class:desktop-shell-content={isDesktopShell}>
    {@render children()}
  </div>

  {#if !isKnowledgeBoardFullscreen}
    <button
      type="button"
      class="farm-icon-button pageatlas-background-toggle"
      class:is-active={showBackgroundOnly}
      aria-pressed={showBackgroundOnly}
      aria-label={showBackgroundOnly ? $t('shell.restore_workspace') : $t('shell.background_only')}
      title={showBackgroundOnly ? $t('shell.restore_workspace') : $t('shell.background_only')}
      onclick={() => (showBackgroundOnly = !showBackgroundOnly)}
    >
      <PixelIcon size={22} pixels={showBackgroundOnly ? iconEyeClosed : iconEye} />
    </button>
  {/if}
</div>
