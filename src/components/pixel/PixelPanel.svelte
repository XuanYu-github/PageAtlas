<script lang="ts">
  let className = '';

  export let tag: 'div' | 'section' | 'aside' | 'button' | 'article' = 'section';
  export let variant: 'paper' | 'field' | 'wood' | 'water' | 'dialog' = 'paper';
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  export let type: 'button' | 'submit' | 'reset' | undefined = undefined;

  export {className as class};

  $: variantClass = `pixel-panel--${variant}`;
  $: paddingClass = `pixel-panel--pad-${padding}`;
</script>

<svelte:element
  this={tag}
  {...$$restProps}
  {type}
  class={`pixel-panel ${variantClass} ${paddingClass} ${className}`.trim()}
>
  <slot />
</svelte:element>
