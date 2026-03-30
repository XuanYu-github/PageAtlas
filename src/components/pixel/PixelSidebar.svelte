<script lang="ts">
  import PixelPanel from './PixelPanel.svelte';

  let className = '';

  export let variant: 'paper' | 'field' | 'wood' | 'water' | 'dialog' = 'paper';

  export {className as class};
</script>

<PixelPanel
  {...$$restProps}
  tag="aside"
  {variant}
  class={`pixel-sidebar ${className}`.trim()}
>
  <slot />
</PixelPanel>
