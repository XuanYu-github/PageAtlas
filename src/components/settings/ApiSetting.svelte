<script lang="ts">
  import {createEventDispatcher, onMount} from 'svelte';
  import {slide} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import {KeyRound, Sparkles, Save, Trash2} from 'lucide-svelte';

  export let isExpanded = false;

  const dispatch = createEventDispatcher();
  const OPENAI_PRESETS_STORAGE_KEY = 'pageatlas_openai_presets';
  const OPENAI_DEFAULT_PRESET_STORAGE_KEY = 'pageatlas_openai_default_preset';

  type OpenAiPreset = {
    id: string;
    name: string;
    baseUrl: string;
    modelText: string;
    modelVision: string;
  };

  const defaultConfig = {
    provider: '',
    apiKey: '',
    doubaoEndpointIdText: '',
    doubaoEndpointIdVision: '',
    openaiBaseUrl: '',
    openaiModelText: '',
    openaiModelVision: '',
  };

  let config = {...defaultConfig};

  let isSaved = false;
  let openAiPresets: OpenAiPreset[] = [];
  let selectedOpenAiPresetId = '';
  let defaultOpenAiPresetId = '';
  let openAiPresetName = '';
  let presetNotice = '';
  let presetFileInput: HTMLInputElement | null = null;

  onMount(() => {
    const savedConfig = localStorage.getItem('pageatlas_api_config');
    const savedPresets = localStorage.getItem(OPENAI_PRESETS_STORAGE_KEY);
    defaultOpenAiPresetId = localStorage.getItem(OPENAI_DEFAULT_PRESET_STORAGE_KEY) || '';

    if (savedPresets) {
      try {
        const parsedPresets = JSON.parse(savedPresets);
        openAiPresets = Array.isArray(parsedPresets) ? parsedPresets : [];
      } catch (e) {
        console.error('Failed to parse OpenAI presets', e);
      }
    }

    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig);
        config = {...defaultConfig, ...parsedConfig};
        dispatch('change', config);
      } catch (e) {
        console.error('Failed to parse api config', e);
      }
    }
  });

  function persistOpenAiPresets() {
    localStorage.setItem(OPENAI_PRESETS_STORAGE_KEY, JSON.stringify(openAiPresets));
  }

  function persistDefaultOpenAiPreset() {
    if (defaultOpenAiPresetId) {
      localStorage.setItem(OPENAI_DEFAULT_PRESET_STORAGE_KEY, defaultOpenAiPresetId);
    } else {
      localStorage.removeItem(OPENAI_DEFAULT_PRESET_STORAGE_KEY);
    }
  }

  function applyOpenAiPreset(presetId: string) {
    selectedOpenAiPresetId = presetId;

    if (!presetId) {
      openAiPresetName = '';
      return;
    }

    const preset = openAiPresets.find((item) => item.id === presetId);
    if (!preset) return;

    config.openaiBaseUrl = preset.baseUrl;
    config.openaiModelText = preset.modelText;
    config.openaiModelVision = preset.modelVision;
    openAiPresetName = preset.name;
    isSaved = false;
  }

  function applyDefaultOpenAiPreset() {
    if (!defaultOpenAiPresetId) return;
    applyOpenAiPreset(defaultOpenAiPresetId);
    presetNotice = $t('settings.openai_preset_default_applied');
  }

  function saveOpenAiPreset() {
    const name = openAiPresetName.trim();
    if (!name) return;

    const nextPreset: OpenAiPreset = {
      id: selectedOpenAiPresetId || crypto.randomUUID(),
      name,
      baseUrl: config.openaiBaseUrl.trim(),
      modelText: config.openaiModelText.trim(),
      modelVision: config.openaiModelVision.trim(),
    };

    const existingIndex = openAiPresets.findIndex((item) => item.id === nextPreset.id);
    if (existingIndex >= 0) {
      openAiPresets[existingIndex] = nextPreset;
      openAiPresets = [...openAiPresets];
    } else {
      openAiPresets = [...openAiPresets, nextPreset].sort((a, b) => a.name.localeCompare(b.name));
    }

    selectedOpenAiPresetId = nextPreset.id;
    persistOpenAiPresets();
    presetNotice = $t('settings.openai_preset_saved');
  }

  function setDefaultOpenAiPreset() {
    if (!selectedOpenAiPresetId) return;
    defaultOpenAiPresetId = selectedOpenAiPresetId;
    persistDefaultOpenAiPreset();
    presetNotice = $t('settings.openai_preset_default_saved');
  }

  function deleteOpenAiPreset() {
    if (!selectedOpenAiPresetId) return;

    openAiPresets = openAiPresets.filter((item) => item.id !== selectedOpenAiPresetId);
    if (defaultOpenAiPresetId === selectedOpenAiPresetId) {
      defaultOpenAiPresetId = '';
      persistDefaultOpenAiPreset();
    }
    selectedOpenAiPresetId = '';
    openAiPresetName = '';
    persistOpenAiPresets();
    presetNotice = $t('settings.openai_preset_deleted');
  }

  function exportOpenAiPresets() {
    const payload = {
      schemaVersion: 1,
      provider: 'openai-compatible',
      presets: openAiPresets,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tocify-openai-presets.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleImportOpenAiPresets(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const importedPresets = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.presets)
          ? parsed.presets
          : [];

      const sanitizedPresets = importedPresets
        .filter((preset: unknown) => preset && typeof preset === 'object' && typeof (preset as {name?: unknown}).name === 'string')
        .map((preset: unknown) => {
          const candidate = preset as {
            id?: unknown;
            name?: unknown;
            baseUrl?: unknown;
            modelText?: unknown;
            modelVision?: unknown;
          };

          return {
            id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
            name: String(candidate.name),
            baseUrl: typeof candidate.baseUrl === 'string' ? candidate.baseUrl : '',
            modelText: typeof candidate.modelText === 'string' ? candidate.modelText : '',
            modelVision: typeof candidate.modelVision === 'string' ? candidate.modelVision : '',
          } as OpenAiPreset;
        });

      const merged = new Map<string, OpenAiPreset>();
      [...openAiPresets, ...sanitizedPresets].forEach((preset) => {
        const key = `${preset.name}::${preset.baseUrl}::${preset.modelText}::${preset.modelVision}`;
        merged.set(key, preset);
      });

      openAiPresets = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
      persistOpenAiPresets();
      presetNotice = $t('settings.openai_preset_imported', {values: {count: sanitizedPresets.length}});
    } catch (error) {
      console.error('Failed to import OpenAI presets', error);
      presetNotice = $t('settings.openai_preset_import_failed');
    } finally {
      input.value = '';
    }
  }

  $: if (config.provider !== 'openai') {
    selectedOpenAiPresetId = '';
    openAiPresetName = '';
  }

  let lastProvider = config.provider;
  $: if (config.provider === 'openai' && lastProvider !== 'openai') {
    const isModelFieldsEmpty = !config.openaiBaseUrl && !config.openaiModelText && !config.openaiModelVision;
    if (isModelFieldsEmpty && defaultOpenAiPresetId) {
      applyDefaultOpenAiPreset();
    }
  }
  $: lastProvider = config.provider;

  function save() {
    localStorage.setItem('pageatlas_api_config', JSON.stringify(config));
    isSaved = true;
    dispatch('save', config);
    dispatch('change', config);

    setTimeout(() => {
      isSaved = false;
    }, 1000);

    setTimeout(() => {
      isExpanded = false;
    }, 400);
  }
</script>

<div class="border-black border-2 rounded-lg p-2 my-4 shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white">
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-2">
      <h2>
        {$t('settings.api_settings_title') || 'API Settings'}
      </h2>
    </div>
    <button
      class="w-6 h-6 flex items-center justify-center transition-transform duration-200"
      class:rotate-180={isExpanded}
      on:click={() => (isExpanded = !isExpanded)}
      aria-label="Toggle API Settings"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
      >
    </button>
  </div>

  {#if isExpanded}
    <div
      class="mt-3"
      transition:slide={{duration: 200}}
    >
      <div class="flex flex-col gap-3">
        <div class="border-black border-2 rounded-md p-2 w-full">
          <label
            class="font-bold mb-1 text-sm flex items-center"
            for="llm_provider">
            <Sparkles size={14} strokeWidth={3} class="inline-block mr-1"/>LLM Provider</label
          >
          <select
            id="llm_provider"
            class="w-full bg-white outline-none text-sm"
            bind:value={config.provider}
            on:change={() => (isSaved = false)}
          >
            <option value="">Auto</option>
            <option value="gemini">Gemini</option>
            <option value="qwen">Qwen</option>
            <option value="doubao">Doubao</option>
            <option value="zhipu">Zhipu</option>
            <option value="openai">OpenAI Compatible</option>
          </select>
        </div>

        {#if config.provider === 'openai'}
          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_preset_select"
            >{$t('settings.openai_preset')}</label>
            <select
              id="openai_preset_select"
              class="w-full bg-white outline-none text-sm"
              bind:value={selectedOpenAiPresetId}
              on:change={(e) => applyOpenAiPreset((e.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">{$t('settings.openai_preset_custom')}</option>
              {#each openAiPresets as preset}
                <option value={preset.id}>{preset.name}</option>
              {/each}
            </select>
          </div>

          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_preset_name"
            >{$t('settings.openai_preset_name')}</label>
            <input
              id="openai_preset_name"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder={$t('settings.openai_preset_name_placeholder')}
              bind:value={openAiPresetName}
            />

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-yellow-100 disabled:bg-gray-100 disabled:text-gray-400"
                on:click={saveOpenAiPreset}
                disabled={!openAiPresetName.trim()}
              >
                <Save size={14} class="inline-block mr-1" />
                {$t('settings.openai_preset_save')}
              </button>
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-red-100 disabled:bg-gray-100 disabled:text-gray-400"
                on:click={deleteOpenAiPreset}
                disabled={!selectedOpenAiPresetId}
              >
                <Trash2 size={14} class="inline-block mr-1" />
                {$t('settings.openai_preset_delete')}
              </button>
            </div>

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-lime-100 disabled:bg-gray-100 disabled:text-gray-400"
                on:click={setDefaultOpenAiPreset}
                disabled={!selectedOpenAiPresetId}
              >
                {$t('settings.openai_preset_set_default')}
              </button>
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-lime-100 disabled:bg-gray-100 disabled:text-gray-400"
                on:click={applyDefaultOpenAiPreset}
                disabled={!defaultOpenAiPresetId}
              >
                {$t('settings.openai_preset_apply_default')}
              </button>
            </div>

            {#if defaultOpenAiPresetId}
              <div class="text-xs text-gray-600 mt-2">
                {$t('settings.openai_preset_default_label')}: {openAiPresets.find((preset) => preset.id === defaultOpenAiPresetId)?.name || $t('settings.openai_preset_custom')}
              </div>
            {/if}

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400"
                on:click={exportOpenAiPresets}
                disabled={openAiPresets.length === 0}
              >
                {$t('settings.openai_preset_export')}
              </button>
              <button
                type="button"
                class="flex-1 border-2 border-black rounded px-3 py-2 text-sm font-bold bg-white hover:bg-blue-100"
                on:click={() => presetFileInput?.click()}
              >
                {$t('settings.openai_preset_import')}
              </button>
            </div>

            <input
              bind:this={presetFileInput}
              type="file"
              accept="application/json,.json"
              class="hidden"
              on:change={handleImportOpenAiPresets}
            />

            {#if presetNotice}
              <div class="text-xs text-gray-600 mt-2">{presetNotice}</div>
            {/if}
          </div>

          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_base_url"
            >Base URL</label>
            <input
              id="openai_base_url"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder="https://api.openai.com/v1"
              bind:value={config.openaiBaseUrl}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_model_text"
            >Text Model</label>
            <input
              id="openai_model_text"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder="gpt-5.4"
              bind:value={config.openaiModelText}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_model_vision"
            >Vision Model (Optional)</label>
            <input
              id="openai_model_vision"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder="Reuse text model if empty"
              bind:value={config.openaiModelVision}
              on:input={() => (isSaved = false)}
            />
          </div>
        {/if}

        {#if config.provider === 'doubao'}
          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="doubao_ep_text">Endpoint ID (Text/Lite)</label
            >
            <input
              id="doubao_ep_text"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder="ep-..."
              bind:value={config.doubaoEndpointIdText}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="border-black border-2 rounded-md p-2 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="doubao_ep_vision">Endpoint ID (Vision/Pro)</label
            >
            <input
              id="doubao_ep_vision"
              type="text"
              class="w-full outline-none text-sm placeholder-gray-400"
              placeholder="ep-..."
              bind:value={config.doubaoEndpointIdVision}
              on:input={() => (isSaved = false)}
            />
          </div>
        {/if}

        <div class="border-black border-2 rounded-md p-2 w-full">
          <label
            class="flex items-center gap-1.5 font-bold mb-1 text-sm"
            for="api_key"
            title="Your LLM provider key (stored locally only)"
          >
            <KeyRound size={14} strokeWidth={3} />
           Key
            <span class="font-normal text-gray-400 text-[11px] ml-2">{$t('settings.api_key_hint')}</span>
          </label>
          <input
            id="api_key"
            type="password"
            class="w-full outline-none placeholder:text-gray-400 placeholder:italic [&::placeholder]:text-xs "
            placeholder={$t('settings.api_key_placeholder')}
            bind:value={config.apiKey}
            on:input={() => (isSaved = false)}
          />
        </div>

        <button
          class="w-full font-bold transition-all duration-200 text-black border-2 border-black rounded px-3 py-2
          {isSaved ? 'bg-lime-400' : 'bg-yellow-400 hover:bg-yellow-300'}"
          on:click={save}
        >
          {isSaved ? $t('btn.saved') : $t('btn.save')}
        </button>
      </div>
    </div>
  {/if}
</div>
