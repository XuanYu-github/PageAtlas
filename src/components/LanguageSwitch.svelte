<script lang="ts">
  import {locale} from 'svelte-i18n';
  import PixelButton from './pixel/PixelButton.svelte';

  const toggle = () => {
    $locale = $locale && $locale.startsWith('zh') ? 'en' : 'zh';
  };
</script>

<PixelButton
  on:click={toggle}
  variant="leaf"
  size="sm"
  class="min-w-[56px]"
>
  {#if $locale && $locale.startsWith('zh')}
    EN
  {:else}
    中
  {/if}
</PixelButton>
