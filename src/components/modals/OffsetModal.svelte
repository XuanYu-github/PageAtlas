<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {fade, fly} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import type {TocItem} from '$lib/pdf/service';
  import Tooltip from '../Tooltip.svelte';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose} from '../icons';

  export let showOffsetModal: boolean;
  export let firstTocItem: TocItem | null;
  export let offsetPreviewPageNum: number;
  export let totalPages: number;

  const dispatch = createEventDispatcher();

  function updatePage(newPage: number) {
    if (newPage > 0 && newPage <= totalPages) {
      offsetPreviewPageNum = newPage;
      dispatch('update:offsetPreviewPageNum', offsetPreviewPageNum);
    }
  }
</script>

{#if showOffsetModal && firstTocItem}
  <div
    class="fixed inset-0 bg-[rgba(57,35,22,0.58)] backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
    transition:fade={{duration: 150}}
    role="button"
    tabindex="0"
    aria-label="Close offset dialog"
    on:click|self={() => (showOffsetModal = false)}
    on:keydown={(e) => (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') && (showOffsetModal = false)}
  >
    <div
      class="panel-paper p-6 w-[95%] md:w-[85%] max-w-5xl max-h-[90vh] overflow-y-auto"
      transition:fly={{y: 20, duration: 200}}
    >
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-xl md:text-2xl font-bold">{$t('offset.title')}</h2>
        <button
          on:click={() => (showOffsetModal = false)}
          class="farm-icon-button"
          aria-label="Close modal"
        >
          <PixelIcon size={18} pixels={iconClose} />
        </button>
      </div>
      <div class="flex flex-col md:flex-row gap-2 md:gap-6 justify-between">
        <div class="w-full md:w-[40%] flex flex-col text-base md:text-xl">
          <div class="my-4 text-gray-700">
            {$t('offset.found_prefix')}
            <strong class="text-black text-2xl md:text-3xl block my-2">{firstTocItem?.title}</strong>
            {$t('offset.found_on_prefix')}
            <div class="my-2"></div>
            <div class="flex items-center gap-4">
              <strong class="text-black text-2xl md:text-3xl">
                {$t('offset.page_n', {
                  values: {n: firstTocItem?.to},
                })}
              </strong>
              <Tooltip
                text={$t('offset.skip_tooltip')}
                position="right"
                width="w-64"
              >
                <span
                  on:click={() => dispatch('skip')}
                  class="bg-gray-50 rounded-lg text-sm border border-gray-300 px-2 py-1 cursor-pointer text-gray-500 hover:text-gray-600 transition-colors"
                  role="button"
                  tabindex="0"
                  on:keydown={(e) => e.key === 'Enter' && dispatch('skip')}
                >
                  {$t('btn.skip_this_item')}
                </span>
              </Tooltip>
            </div>
          </div>
          <p class="mt-4 mb-2 text-gray-700 text-sm">{$t('offset.instruction')}</p>

          <div class="flex gap-4 items-center mb-4">
            <label
              for="physical_page_select"
              class="font-semibold">{$t('offset.physical_page_label')}</label
            >
            <div class="flex items-center gap-2">
              <button
                  class="btn farm-btn-secondary p-2 h-10 w-10"
                on:click={() => updatePage(offsetPreviewPageNum - 1)}
                disabled={offsetPreviewPageNum <= 1}
              >
                -
              </button>
              <input
                type="number"
                id="physical_page_select"
                bind:value={offsetPreviewPageNum}
                on:input={(e) => updatePage(parseInt(e.currentTarget.value, 10))}
                min={1}
                max={totalPages}
                class="border-2 border-black rounded px-2 py-1 w-20 h-10 text-center font-bold text-2xl [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                  class="btn farm-btn-secondary p-2 h-10 w-10"
                on:click={() => updatePage(offsetPreviewPageNum + 1)}
                disabled={offsetPreviewPageNum >= totalPages}
              >
                +
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2 mt-auto mb-1">
            <button
              on:click={() => dispatch('confirm')}
              class="btn w-full"
            >
              {$t('btn.yes_this_page')}
            </button>
          </div>
        </div>
        <div class="w-full md:w-[50%]">
            <div class="panel-lake overflow-hidden h-[70vh] p-2">
              <canvas
                id="offset-preview-canvas"
                class="w-96 h-full mx-auto rounded-[14px] bg-[rgba(255,255,255,0.78)]"
              ></canvas>
            </div>
        </div>
      </div>
    </div>
  </div>
{/if}
