<script lang="ts">
  import {base} from '$app/paths';
  import {onDestroy, onMount} from 'svelte';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose, iconMaximize, iconMinimize} from '../icons';

  export let title = 'PageAtlas';

  type WindowApi = {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onResized: (handler: () => void) => Promise<() => void>;
  };

  let appWindow: WindowApi | null = null;
  let isMaximized = false;
  let unlistenResize: (() => void) | null = null;

  async function refreshMaximizedState() {
    if (!appWindow) return;
    isMaximized = await appWindow.isMaximized();
  }

  async function handleMinimize() {
    if (!appWindow) return;
    await appWindow.minimize();
  }

  async function handleToggleMaximize() {
    if (!appWindow) return;
    await appWindow.toggleMaximize();
    await refreshMaximizedState();
  }

  async function handleClose() {
    if (!appWindow) return;
    await appWindow.close();
  }

  onMount(async () => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

    const {Window} = await import('@tauri-apps/api/window');
    appWindow = Window.getCurrent() as unknown as WindowApi;
    await refreshMaximizedState();
    unlistenResize = await appWindow.onResized(async () => {
      await refreshMaximizedState();
    });
  });

  onDestroy(() => {
    unlistenResize?.();
  });

  const appIconSrc = `${base}/favicon.svg`;
</script>

<div class="desktop-titlebar panel-wood">
  <div class="desktop-titlebar__strip">
    <div class="desktop-titlebar__drag" data-tauri-drag-region>
      <div class="desktop-titlebar__brand" data-tauri-drag-region>
        <img
          src={appIconSrc}
          alt=""
          class="desktop-titlebar__app-icon pixel-art"
          draggable="false"
          data-tauri-drag-region
        />
        <div class="desktop-titlebar__title" data-tauri-drag-region>{title}</div>
      </div>
    </div>
    <div class="desktop-titlebar__controls">
      <button
        type="button"
        class="farm-icon-button desktop-titlebar__button"
        on:mousedown|stopPropagation
        on:click|stopPropagation={handleMinimize}
        aria-label="Minimize window"
      >
        <PixelIcon size={10} pixels={iconMinimize} />
      </button>
      <button
        type="button"
        class="farm-icon-button desktop-titlebar__button"
        on:mousedown|stopPropagation
        on:click|stopPropagation={handleToggleMaximize}
        aria-label="Toggle maximize window"
      >
        <PixelIcon size={10} pixels={iconMaximize} />
      </button>
      <button
        type="button"
        class="farm-icon-button desktop-titlebar__button desktop-titlebar__button--close"
        on:mousedown|stopPropagation
        on:click|stopPropagation={handleClose}
        aria-label="Close window"
      >
        <PixelIcon size={10} pixels={iconClose} />
      </button>
    </div>
  </div>
</div>
