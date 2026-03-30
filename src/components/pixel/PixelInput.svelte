<script lang="ts">
  let className = '';

  export let value: string | number = '';
  export let type = 'text';
  export let disabled = false;

  export {className as class};
</script>

<input
  {...$$restProps}
  bind:value
  {type}
  {disabled}
  class={`pixel-input ${className}`.trim()}
  on:input
  on:change
  on:focus
  on:blur
  on:keydown
  on:keypress
/>
