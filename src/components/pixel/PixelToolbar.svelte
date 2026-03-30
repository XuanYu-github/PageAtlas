<script lang="ts">
  let className = '';

  export let compact = false;

  export {className as class};
</script>

<div
  {...$$restProps}
  class={`pixel-toolbar ${compact ? 'pixel-toolbar--compact' : ''} ${className}`.trim()}
>
  <slot />
</div>
