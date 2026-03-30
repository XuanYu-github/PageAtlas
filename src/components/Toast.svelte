<script lang="ts">
  import {onMount} from 'svelte';
  import {createEventDispatcher} from 'svelte';
  import {fly} from 'svelte/transition';
  import PixelIcon from './icons/PixelIcon.svelte';
  import {iconAlert, iconCheck, iconInfo} from './icons';

  export let message = 'Success!';
  export let duration = 3000;
  export let type: 'success' | 'error' | 'info' = 'info';

  const dispatch = createEventDispatcher();
  let isDesktopShell = false;

  let timeout: ReturnType<typeof setTimeout>;
  onMount(() => {
    isDesktopShell = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    timeout = setTimeout(() => {
      dispatch('close');
    }, duration + (type === 'error' ? 3000 : 0));
    return () => clearTimeout(timeout);
  });

</script>

<div
  class="fixed text-black right-1/2 w-[90vw] md:w-fit max-w-[90vw] transform translate-x-1/2 md:-translate-x-0 p-3 md:p-4 panel-paper flex items-center z-[999]"
  class:top-10={isDesktopShell}
  class:md:top-10={isDesktopShell}
  class:top-2={!isDesktopShell}
  class:md:top-5={!isDesktopShell}
  class:md:right-5={true}
  class:!bg-[linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.04)),linear-gradient(180deg,#dbe9af,#9cbc66)]={type === 'success'}
  class:!bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.04)),linear-gradient(180deg,#e8a38c,#c55c45)]={type === 'error'}
  class:!bg-[linear-gradient(180deg,rgba(255,255,255,0.3),rgba(255,255,255,0.04)),linear-gradient(180deg,#ffe089,#f3bf35)]={type === 'info'}
  transition:fly={{ y: -50, x: 0, duration: 300, opacity: 0.5 }}>
  {#if type === 'success'}
    <PixelIcon size={20} pixels={iconCheck} class="mr-3 flex-shrink-0" />
  {:else if type === 'error'}
    <PixelIcon size={20} pixels={iconAlert} class="mr-3 flex-shrink-0" />
  {:else}
    <PixelIcon size={20} pixels={iconInfo} class="mr-3 flex-shrink-0" />
  {/if}

  <span class="font-semibold font-pixel-ui text-sm leading-6">{message}</span>
</div>
