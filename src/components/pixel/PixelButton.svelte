<script lang="ts">
  let className = '';

  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let variant: 'gold' | 'leaf' | 'water' | 'night' | 'danger' | 'tab' = 'gold';
  export let size: 'sm' | 'md' | 'icon' = 'md';
  export let active = false;
  export let disabled = false;

  export {className as class};

  $: variantClass = `pixel-button--${variant}`;
  $: sizeClass = `pixel-button--${size}`;
</script>

<button
  {...$$restProps}
  {type}
  {disabled}
  class={`pixel-button ${variantClass} ${sizeClass} ${active ? 'is-active' : ''} ${className}`.trim()}
  on:click
  on:keydown
  on:keyup
  on:focus
  on:blur
>
  <slot />
</button>
