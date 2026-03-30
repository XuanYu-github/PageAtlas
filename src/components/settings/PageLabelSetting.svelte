<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageLabelSettings, PageLabelStyle } from '$lib/pdf/page-labels';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconTrash} from '../icons';

  export let settings: PageLabelSettings;

  const dispatch = createEventDispatcher();

  const styles: { value: PageLabelStyle; label: string }[] = [
    { value: 'decimal', label: '1, 2, 3' },
    { value: 'roman_lower', label: 'i, ii, iii' },
    { value: 'roman_upper', label: 'I, II, III' },
    { value: 'alpha_lower', label: 'a, b, c' },
    { value: 'alpha_upper', label: 'A, B, C' },
    { value: 'none', label: '(prefix only)' },
  ];

  function emitSegments(segments: PageLabelSettings['segments']) {
    dispatch('change', { ...settings, segments });
  }

  function addSegment() {
    const lastSegment = settings.segments && settings.segments.length > 0 ?
        settings.segments[settings.segments.length - 1] :
        null;

    const nextStartPage = lastSegment ? lastSegment.startPage + 1 : 1;

    const next = [
      ...(settings.segments || []),
      {
        startPage: nextStartPage,
        style: 'decimal' as PageLabelStyle,
        prefix: '',
        startAt: 1
      },
    ];
    emitSegments(next);
  }

  function removeSegment(index: number) {
    const segments = (settings.segments || []).filter((_, i) => i !== index);
    const enabled = segments.length > 0;
    dispatch('change', { ...settings, enabled, segments });
  }

  function updateSegment(index: number, patch: Partial<PageLabelSettings['segments'][number]>) {
    const next = (settings.segments || []).map((seg, i) => (i === index ? { ...seg, ...patch } : seg));
    emitSegments(next);
  }
</script>

<div class="space-y-3">
  <div class="farm-subtitle">
    {$t('settings.page_labels_hint')}
  </div>

  {#each settings.segments || [] as seg, i (i)}
    {@const startPageId = `page-label-start-${i}`}
    {@const styleId = `page-label-style-${i}`}
    {@const prefixId = `page-label-prefix-${i}`}
    {@const startAtId = `page-label-start-at-${i}`}
    {#if i > 0}
      <div class="border-t-[3px] border-dashed border-[color:var(--pa-paper-line)] mx-auto"></div>
    {/if}
    <div class="relative">
      <div class="flex justify-between items-center mb-2">
        <span class="farm-badge">{$t('label.segment_range_n', {values: {n: i + 1}})}</span>
        <button class="farm-icon-button w-8 h-8 text-[color:var(--pa-berry)]"
          on:click={() => removeSegment(i)}
          title={$t('settings.remove')}
        >
          <PixelIcon size={14} pixels={iconTrash} />
        </button>
      </div>
      <div class="panel-paper p-3 flex items-center gap-2">
        <div class="w-20">
          <label for={startPageId} class="text-xs text-gray-500 block mb-1">{$t('settings.start_page')}</label>
          <input
            id={startPageId}
            type="number"
            min="1"
            class="w-full h-8 text-sm border-2 border-gray-300 rounded px-2 focus:outline-none focus:bg-gray-50"
            value={seg.startPage}
            on:input={(e) =>
              updateSegment(i, { startPage: parseInt((e.target as HTMLInputElement).value, 10) || 1 })}
          />
        </div>

        <div class="flex-1 min-w-[120px]">
          <label for={styleId} class="text-xs text-gray-500 block mb-1">{$t('settings.style')}</label>
          <select
            id={styleId}
            class="w-full h-8 text-sm border-2 border-gray-300 rounded px-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-black/20"
            value={seg.style}
            on:change={(e) =>
              updateSegment(i, { style: (e.target as HTMLSelectElement).value as PageLabelStyle })}
          >
            {#each styles as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="panel-paper p-3 flex items-center gap-2 mt-2">
        <div class="flex-1 min-w-[120px]">
          <label for={prefixId} class="text-xs text-gray-500 block mb-1">{$t('settings.prefix')}</label>
          <input
            id={prefixId}
            type="text"
            class="w-full h-8 text-sm border-2 border-gray-300 rounded px-2 focus:outline-none focus:bg-gray-50"
            placeholder="e.g. A-"
            value={seg.prefix}
            on:input={(e) => updateSegment(i, { prefix: (e.target as HTMLInputElement).value })}
          />
        </div>

        <div class="w-20">
          <label for={startAtId} class="text-xs text-gray-500 block mb-1">{$t('settings.start_at')}</label>
          <input
            id={startAtId}
            type="number"
            min="1"
            class="w-full h-8 text-sm border-2 border-gray-300 rounded px-2 focus:outline-none focus:bg-gray-50"
            value={seg.startAt}
            on:input={(e) =>
              updateSegment(i, { startAt: parseInt((e.target as HTMLInputElement).value, 10) || 1 })}
            disabled={seg.style === 'none'}
          />
        </div>
      </div>

    </div>
  {/each}

  <button
    class="btn farm-btn-secondary w-full"
    on:click={addSegment}
    title={$t('settings.add_segment')}
    aria-label={$t('settings.add_segment')}
  >
    +
  </button>
</div>
