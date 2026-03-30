<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import {slide} from 'svelte/transition';
  import {type LevelConfig, type CounterStyle, convertNum} from '$lib/utils/prefix';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconChevronDown} from '../icons/index';

  export let settings: {
    enabled: boolean;
    configs: LevelConfig[];
  };

  const dispatch = createEventDispatcher();

  let expandedStates: boolean[] = settings.configs.map((_, i) => i === 0);

  const styles: {value: CounterStyle; label: string}[] = [
    {value: 'decimal', label: '1, 2, 3'},
    {value: 'chinese_simple', label: '一, 二, 三'},
    {value: 'roman_upper', label: 'I, II, III'},
    {value: 'alpha_upper', label: 'A, B, C'},
    {value: 'none', label: $t('settings.none')},
  ];

  function handleChange() {
    dispatch('change', settings);
  }

  function toggleExpand(index: number) {
    expandedStates[index] = !expandedStates[index];
  }

  function getPreview(config: LevelConfig, index: number): string {
    const num = convertNum(1, config.style);
    if (index === 0) {
      return `${config.prefix}${num}${config.suffix}`;
    } else {
      let core = num;
      if (config.inheritParent) {
        const parentNum = convertNum(1, config.style);
        const sep = config.separator || '.';
        core = `${parentNum}${sep}${num}`;
      }
      return `${config.prefix}${core}${config.suffix}`;
    }
  }
</script>

<div class="space-y-3">
  <div class="flex justify-between items-center">
    <h3 class="farm-section-title !mb-0">{$t('settings.add_numbering')}</h3>

    <label class="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        class="sr-only peer"
        bind:checked={settings.enabled}
        on:change={handleChange}
      />
      <div class="pixel-toggle"></div>
    </label>
  </div>

  {#if settings.enabled}
    <div
      transition:slide={{duration: 200}}
      class="space-y-3"
    >
      {#each settings.configs as config, i}
        {@const styleId = `prefix-style-${i}`}
        {@const inheritId = `prefix-inherit-${i}`}
        {@const separatorId = `prefix-separator-${i}`}
        {@const prefixId = `prefix-value-${i}`}
        {@const suffixId = `prefix-suffix-${i}`}
        <div class="panel-paper overflow-hidden transition-all duration-200">
          <button
            class="w-full flex justify-between items-center px-3 py-3 border-b-2 border-transparent hover:bg-[rgba(255,255,255,0.32)] transition-colors text-left"
            class:border-[rgba(120,80,48,0.15)]={expandedStates[i]}
            on:click={() => toggleExpand(i)}
          >
            <div class="flex items-center gap-2">
              <PixelIcon size={16} pixels={iconChevronDown} class={expandedStates[i] ? 'rotate-180 transition-transform duration-200' : 'transition-transform duration-200'} />

              <span class="font-bold text-sm select-none">
                {i === 0 ? $t('settings.first_level') : $t('settings.other_levels')}
              </span>
            </div>

            <div
              class="farm-badge text-xs truncate max-w-[150px] sm:max-w-[240px]"
              title={$t('settings.preview')}
            >
              {getPreview(config, i)} Title
            </div>
          </button>

          {#if expandedStates[i]}
            <div
              transition:slide={{duration: 200}}
              class="p-3 pt-0"
            >
                <div class="space-y-3 pt-3">
                  <div class="flex gap-2 items-end">
                  <div class="panel-paper p-3 flex-grow">
                    <label for={styleId} class="text-sm text-gray-500 mb-1 block">{$t('settings.style')}</label>
                    <select
                      id={styleId}
                      class="w-full h-8 text-xs px-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-black/20"
                      bind:value={config.style}
                      on:change={handleChange}
                    >
                      {#each styles as s}
                        <option value={s.value}>{s.label}</option>
                      {/each}
                    </select>
                  </div>

                  {#if i > 0}
                    <div class="panel-paper p-3 flex flex-col items-center">
                      <label for={inheritId} class="text-sm text-gray-500 mb-1 block">{$t('settings.inherit_parent')}</label>
                      <input
                        id={inheritId}
                        type="checkbox"
                        class="checkbox h-8 w-8 checkbox-xs outline-2 outline-gray-300 rounded-sm checkbox-primary"
                        bind:checked={config.inheritParent}
                        on:change={handleChange}
                      />
                    </div>

                    {#if config.inheritParent}
                      <div
                        class="panel-paper p-3 w-20"
                        transition:slide={{axis: 'x', duration: 200}}
                      >
                        <label for={separatorId} class="text-sm text-gray-500 mb-1 block max-h-5">{$t('settings.separator')}</label>
                        <input
                          id={separatorId}
                          type="text"
                          class="w-full h-8 text-xs text-center focus:outline-none focus:bg-gray-50"
                          bind:value={config.separator}
                          on:input={handleChange}
                        />
                      </div>
                    {/if}
                  {/if}
                </div>

                <div class="flex gap-2 items-center">
                  <div class="panel-paper p-3 flex-1">
                    <label for={prefixId} class="text-sm text-gray-500 mb-1 block">{$t('settings.prefix')}</label>
                    <input
                      id={prefixId}
                      type="text"
                      class="w-full h-8 text-xs px-2 focus:outline-none focus:bg-gray-50"
                      placeholder="e.g. Chapter"
                      bind:value={config.prefix}
                      on:input={handleChange}
                    />
                  </div>

                  <div class="pt-5 text-[color:var(--pa-wood-dark)] font-bold">➜</div>

                  <div class="panel-paper p-3 flex-1">
                    <label for={suffixId} class="text-sm text-gray-500 mb-1 block">{$t('settings.suffix')}</label>
                    <input
                      id={suffixId}
                      type="text"
                      class="w-full h-8 text-xs px-2 focus:outline-none focus:bg-gray-50"
                      placeholder="e.g. ."
                      bind:value={config.suffix}
                      on:input={handleChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
