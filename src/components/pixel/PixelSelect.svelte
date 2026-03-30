<script lang="ts">
  let className = '';

  export let value = '';
  export let disabled = false;

  export {className as class};
</script>

<select
  {...$$restProps}
  bind:value
  {disabled}
  class={`pixel-select ${className}`.trim()}
  on:change
  on:focus
  on:blur
>
  <slot />
</select>
