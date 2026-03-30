<script lang="ts">
  import PixelPanel from './PixelPanel.svelte';

  let className = '';
  let surfaceClassName = '';

  export let open = true;
  export let variant: 'paper' | 'field' | 'wood' | 'water' | 'dialog' = 'dialog';

  export {className as class, surfaceClassName as surfaceClass};
</script>

{#if open}
  <div class={`pixel-dialog ${className}`.trim()}>
    <PixelPanel
      {...$$restProps}
      variant={variant}
      class={`pixel-dialog__surface ${surfaceClassName}`.trim()}
    >
      <slot />
    </PixelPanel>
  </div>
{/if}
