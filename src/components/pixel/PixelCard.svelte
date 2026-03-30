<script lang="ts">
  let className = '';

  export let tag: 'div' | 'button' | 'article' = 'div';
  export let variant: 'paper' | 'field' | 'wood' | 'water' | 'dialog' = 'paper';
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'sm';
  export let type: 'button' | 'submit' | 'reset' = 'button';

  export {className as class};

  $: variantClass = `pixel-panel--${variant}`;
  $: paddingClass = `pixel-panel--pad-${padding}`;
</script>

{#if tag === 'button'}
  <button
    {...$$restProps}
    {type}
    class={`pixel-panel pixel-card ${variantClass} ${paddingClass} ${className}`.trim()}
    on:click
    on:keydown
    on:keyup
  >
    <slot />
  </button>
{:else}
  <svelte:element
    this={tag}
    {...$$restProps}
    class={`pixel-panel pixel-card ${variantClass} ${paddingClass} ${className}`.trim()}
  >
    <slot />
  </svelte:element>
{/if}
