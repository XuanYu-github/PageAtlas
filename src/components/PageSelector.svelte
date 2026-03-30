<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import PixelIcon from './icons/PixelIcon.svelte';
  import PixelButton from './pixel/PixelButton.svelte';
  import PixelCard from './pixel/PixelCard.svelte';
  import PixelInput from './pixel/PixelInput.svelte';
  import {iconPlus, iconTrash} from './icons';

  export let tocRanges: {start: number; end: number; id: string}[] = [];
  export let activeRangeIndex: number = 0;
  export let totalPages: number;
  export let title = '';
  export let addRangeTitle = '';

  const dispatch = createEventDispatcher();

  function addRange() {
    dispatch('addRange');
  }

  function removeRange(index: number) {
    dispatch('removeRange', {index});
  }

  function setActiveRange(index: number) {
    dispatch('setActiveRange', {index});
  }

  function handleRangeChange() {
    dispatch('rangeChange');
  }
</script>

<div class="panel-field p-3 my-4">
  <div class="flex justify-between items-center mb-2">
    <h3 class="farm-section-title !mb-0">{title || $t('label.toc_pages_selection')}</h3>
    <PixelButton
      on:click={addRange}
      size="icon"
      variant="leaf"
      class="w-10 h-10"
      title={addRangeTitle || $t('label.add_range')}
    >
      <PixelIcon size={18} pixels={iconPlus} />
    </PixelButton>
  </div>

  <div class="flex flex-col gap-3">
    {#each tocRanges as range, i (range.id)}
      <PixelCard
        variant={i === activeRangeIndex ? 'water' : 'paper'}
        class={`flex flex-col gap-2 p-3 cursor-pointer transition-all ${i === activeRangeIndex ? 'translate-x-[4px]' : ''}`}
        role="button"
        tabindex="0"
        on:click={() => setActiveRange(i)}
        on:keydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveRange(i);
          }
        }}
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-[color:var(--pa-ink-soft)] uppercase tracking-wider"
            >{$t('label.range_n', {values: {n: i + 1}})}</span
          >
          {#if tocRanges.length > 1}
            <PixelButton
              on:click={(event) => {
                event.stopPropagation();
                removeRange(i);
              }}
              size="icon"
              variant="danger"
              class="w-9 h-9 text-[color:var(--pa-ink-inverse)]"
            >
              <PixelIcon size={14} pixels={iconTrash} />
            </PixelButton>
          {/if}
        </div>

        <div class="flex gap-2 items-center">
          <div class="flex flex-col gap-1 flex-1">
            <label
              for={`start-${range.id}`}
              class="text-xs font-bold text-[color:var(--pa-ink-soft)]">{$t('label.start')}</label
            >
            <PixelInput
              type="number"
              id={`start-${range.id}`}
              bind:value={range.start}
              on:input={handleRangeChange}
              min={1}
              max={totalPages}
              class="text-sm"
            />
          </div>
          <div class="flex flex-col gap-1 flex-1">
            <label
              for={`end-${range.id}`}
              class="text-xs font-bold text-[color:var(--pa-ink-soft)]">{$t('label.end')}</label
            >
            <PixelInput
              type="number"
              id={`end-${range.id}`}
              bind:value={range.end}
              on:input={handleRangeChange}
              min={range.start}
              max={totalPages}
              class="text-sm"
            />
          </div>
        </div>
      </PixelCard>
    {/each}
  </div>
</div>
