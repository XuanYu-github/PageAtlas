<script lang="ts">
  let className = '';
  export let size = 20;
  export let label = '';
  export let color = 'currentColor';
  export let bg = 'transparent';
  export let pixels: Array<[number, number]> = [];
  export let pixelSize = 2;
  export let viewBox = 16;
  export {className as class};
</script>

<svg
  width={size}
  height={size}
  viewBox={`0 0 ${viewBox} ${viewBox}`}
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  class={className}
  style="image-rendering: pixelated; shape-rendering: crispEdges;"
>
  {#if bg !== 'transparent'}
    <rect x="0" y="0" width={viewBox} height={viewBox} fill={bg}></rect>
  {/if}

  {#each pixels as [x, y]}
    <rect x={x} y={y} width={pixelSize} height={pixelSize} fill={color}></rect>
  {/each}
</svg>
