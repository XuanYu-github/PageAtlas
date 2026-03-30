<script lang="ts">
  import {createEventDispatcher, onMount} from 'svelte';
  import {slide} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import {
    BROWSER_AI_CONFIG_STORAGE_KEY,
    createBrowserAiConfig,
    loadBrowserAiConfigFromStorage,
    normalizeOpenAIReasoningEffort,
  } from '$lib/client/ai-config';
  import type {OpenAIReasoningEffort, ResolvedBrowserAiConfig} from '$lib/client/ai-config';
  import type {BrowserAiConnectionDiagnosticStage, BrowserAiConnectionError} from '$lib/client/ai';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconChevronDown, iconKey, iconSave, iconSparkle, iconTrash} from '../icons/index';

  export let isExpanded = false;

  const dispatch = createEventDispatcher<{
    change: ResolvedBrowserAiConfig;
    save: ResolvedBrowserAiConfig;
    notify: {message: string; type: 'success' | 'error' | 'info'};
  }>();
  const OPENAI_PRESETS_STORAGE_KEY = 'pageatlas_openai_presets';
  const OPENAI_DEFAULT_PRESET_STORAGE_KEY = 'pageatlas_openai_default_preset';
  const VERIFIED_CONFIG_SIGNATURE_STORAGE_KEY = 'pageatlas_api_config_verified_signature';

  type OpenAiPreset = {
    id: string;
    name: string;
    baseUrl: string;
    modelText: string;
    modelVision: string;
    reasoningEffort: OpenAIReasoningEffort;
  };

  const defaultConfig = createBrowserAiConfig();

  let config = {...defaultConfig};

  let isSaved = false;
  let isTesting = false;
  let testNotice = '';
  let testNoticeType: 'success' | 'error' | 'info' = 'info';
  let diagnosticStages: BrowserAiConnectionDiagnosticStage[] = [];
  let verifiedConfigSignature = '';
  let openAiPresets: OpenAiPreset[] = [];
  let selectedOpenAiPresetId = '';
  let defaultOpenAiPresetId = '';
  let openAiPresetName = '';
  let presetNotice = '';
  let presetFileInput: HTMLInputElement | null = null;

  function formatConnectionErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const connectionError = error as BrowserAiConnectionError;
      const detail = connectionError.message;

      if (connectionError.code === 'api_key_missing') return $t('settings.error_api_key_missing');
      if (connectionError.code === 'model_missing') return $t('settings.error_model_missing');
      if (connectionError.code === 'model_not_found') return $t('settings.error_model_not_found');
      if (connectionError.code === 'base_url_invalid') return $t('settings.error_base_url_invalid');
      if (connectionError.code === 'network_unreachable') return $t('settings.error_network_unreachable');
      if (connectionError.code === 'cors_models_blocked') return $t('settings.error_cors_models_blocked');
      if (connectionError.code === 'cors_chat_blocked') return $t('settings.error_cors_chat_blocked');
      if (connectionError.code === 'network_or_cors') return $t('settings.error_network_or_cors');
      if (connectionError.code === 'unauthorized') return $t('settings.error_unauthorized');
      if (connectionError.code === 'forbidden') return $t('settings.error_forbidden');
      if (connectionError.code === 'not_found') return $t('settings.error_not_found');
      if (connectionError.code === 'rate_limited') return $t('settings.error_rate_limited');

      return detail ? `${$t('settings.error_unknown')} ${detail}` : $t('settings.error_unknown');
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return String(error);
  }

  function getStageLabel(key: BrowserAiConnectionDiagnosticStage['key']): string {
    if (key === 'models') return $t('settings.connection_stage_models');
    if (key === 'chat') return $t('settings.connection_stage_chat');
    return $t('settings.connection_stage_generate');
  }

  function getStageStatusLabel(status: BrowserAiConnectionDiagnosticStage['status']): string {
    if (status === 'success') return $t('settings.connection_stage_success');
    if (status === 'error') return $t('settings.connection_stage_failed');
    return $t('settings.connection_stage_skipped');
  }

  function getStageMessage(stage: BrowserAiConnectionDiagnosticStage): string {
    if (stage.status === 'success') {
      if (stage.key === 'models') return $t('settings.connection_stage_models_success');
      if (stage.key === 'chat') return $t('settings.connection_stage_chat_success');
      return $t('settings.connection_stage_generate_success');
    }

    if (stage.status === 'skipped') {
      return $t('settings.connection_stage_skipped');
    }

    return formatConnectionErrorMessage(stage.error);
  }

  onMount(() => {
    const savedPresets = localStorage.getItem(OPENAI_PRESETS_STORAGE_KEY);
    defaultOpenAiPresetId = localStorage.getItem(OPENAI_DEFAULT_PRESET_STORAGE_KEY) || '';
    verifiedConfigSignature = localStorage.getItem(VERIFIED_CONFIG_SIGNATURE_STORAGE_KEY) || '';

    if (savedPresets) {
      try {
        const parsedPresets = JSON.parse(savedPresets);
        openAiPresets = Array.isArray(parsedPresets) ? parsedPresets : [];
      } catch (e) {
        console.error('Failed to parse OpenAI presets', e);
      }
    }

    config = loadBrowserAiConfigFromStorage();
    dispatch('change', config);
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

  function getConfigSignature(currentConfig: typeof defaultConfig): string {
    return JSON.stringify({
      provider: currentConfig.provider.trim(),
      apiKey: currentConfig.apiKey.trim(),
      doubaoEndpointIdText: currentConfig.doubaoEndpointIdText.trim(),
      doubaoEndpointIdVision: currentConfig.doubaoEndpointIdVision.trim(),
      openaiBaseUrl: currentConfig.openaiBaseUrl.trim(),
      openaiModelText: currentConfig.openaiModelText.trim(),
      openaiModelVision: currentConfig.openaiModelVision.trim(),
      openaiReasoningEffort: normalizeOpenAIReasoningEffort(currentConfig.openaiReasoningEffort),
    });
  }

  function persistVerifiedConfigSignature(signature: string) {
    verifiedConfigSignature = signature;

    if (signature) {
      localStorage.setItem(VERIFIED_CONFIG_SIGNATURE_STORAGE_KEY, signature);
    } else {
      localStorage.removeItem(VERIFIED_CONFIG_SIGNATURE_STORAGE_KEY);
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
    config.openaiReasoningEffort = preset.reasoningEffort;
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
      reasoningEffort: normalizeOpenAIReasoningEffort(config.openaiReasoningEffort),
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
    link.download = 'pageatlas-openai-presets.json';
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
            reasoningEffort?: unknown;
          };

          return {
            id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
            name: String(candidate.name),
            baseUrl: typeof candidate.baseUrl === 'string' ? candidate.baseUrl : '',
            modelText: typeof candidate.modelText === 'string' ? candidate.modelText : '',
            modelVision: typeof candidate.modelVision === 'string' ? candidate.modelVision : '',
            reasoningEffort:
              candidate.reasoningEffort === 'low' ||
              candidate.reasoningEffort === 'medium' ||
              candidate.reasoningEffort === 'high' ||
              candidate.reasoningEffort === 'xhigh'
                ? candidate.reasoningEffort
                : 'none',
          } as OpenAiPreset;
        });

      const merged = new Map<string, OpenAiPreset>();
      [...openAiPresets, ...sanitizedPresets].forEach((preset) => {
        const key = `${preset.name}::${preset.baseUrl}::${preset.modelText}::${preset.modelVision}::${preset.reasoningEffort}`;
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
  $: currentConfigSignature = getConfigSignature(config);
  $: isConnectionVerified = !!verifiedConfigSignature && verifiedConfigSignature === currentConfigSignature;

  function save() {
    localStorage.setItem(BROWSER_AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
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

  async function testConnection() {
    isTesting = true;
    testNotice = '';
    testNoticeType = 'info';
    diagnosticStages = [];

    try {
      const {diagnoseBrowserAiConnection} = await import('$lib/client/ai');
      const result = await diagnoseBrowserAiConnection(config);
      diagnosticStages = result.stages;

      if (result.ok) {
        const message = $t('settings.connection_success', {values: {provider: result.provider}});
        persistVerifiedConfigSignature(currentConfigSignature);
        testNotice = message;
        testNoticeType = 'success';
        dispatch('notify', {message, type: 'success'});
      } else {
        const firstError = result.stages.find((stage) => stage.status === 'error')?.error;
        const message = formatConnectionErrorMessage(firstError);
        persistVerifiedConfigSignature('');
        testNotice = $t('settings.connection_failed', {values: {message}});
        testNoticeType = 'error';
        dispatch('notify', {message: testNotice, type: 'error'});
      }
    } catch (error) {
      diagnosticStages = [];
      const message = formatConnectionErrorMessage(error);
      persistVerifiedConfigSignature('');
      testNotice = $t('settings.connection_failed', {values: {message}});
      testNoticeType = 'error';
      dispatch('notify', {message: testNotice, type: 'error'});
    } finally {
      isTesting = false;
    }
  }
</script>

<div class="panel-paper pixel-reading-surface p-3 my-4">
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-2">
      <h2 class="farm-section-title !mb-0">
        {$t('settings.api_settings_title') || 'API Settings'}
      </h2>
      {#if isConnectionVerified}
        <span class="farm-badge !bg-[linear-gradient(180deg,#dff8b8,#8ebb4f)] text-[color:var(--pa-border-strong)]">
          {$t('settings.connection_verified')}
        </span>
      {/if}
    </div>
    <button
      class="farm-icon-button w-9 h-9"
      class:is-active={isExpanded}
      on:click={() => (isExpanded = !isExpanded)}
      aria-label={$t('settings.api_settings_title')}
    >
      <PixelIcon
        size={16}
        pixels={iconChevronDown}
        class={isExpanded ? 'rotate-180 transition-transform duration-150' : 'transition-transform duration-150'}
      />
    </button>
  </div>

  {#if isExpanded}
    <div
      class="mt-3"
      transition:slide={{duration: 200}}
    >
      <div class="flex flex-col gap-3">
        <div class="panel-paper pixel-reading-surface px-3 py-3 w-full">
          <label
            class="font-bold mb-1 text-sm flex items-center"
            for="llm_provider">
            <PixelIcon size={14} pixels={iconSparkle} class="inline-block mr-1"/>{$t('settings.llm_provider')}</label
          >
          <select
            id="llm_provider"
            class="w-full outline-none text-sm text-[color:var(--pa-bark)]"
            bind:value={config.provider}
            on:change={() => (isSaved = false)}
          >
            <option value="">{$t('settings.provider_auto')}</option>
            <option value="gemini">Gemini</option>
            <option value="qwen">Qwen</option>
            <option value="doubao">Doubao</option>
            <option value="zhipu">Zhipu</option>
            <option value="openai">{$t('settings.provider_openai_compatible')}</option>
          </select>
        </div>

        {#if config.provider === 'openai'}
          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_preset_select"
            >{$t('settings.openai_preset')}</label>
            <select
              id="openai_preset_select"
              class="w-full outline-none text-sm text-[color:var(--pa-bark)]"
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
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_preset_name"
            >{$t('settings.openai_preset_name')}</label>
              <input
                id="openai_preset_name"
                type="text"
                class="w-full outline-none text-sm placeholder-gray-400 text-[color:var(--pa-bark)]"
              placeholder={$t('settings.openai_preset_name_placeholder')}
              bind:value={openAiPresetName}
            />

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="btn w-full flex-1"
                on:click={saveOpenAiPreset}
                disabled={!openAiPresetName.trim()}
              >
                <PixelIcon size={14} pixels={iconSave} class="inline-block mr-1" />
                {$t('settings.openai_preset_save')}
              </button>
              <button
                type="button"
                class="btn farm-btn-danger w-full flex-1"
                on:click={deleteOpenAiPreset}
                disabled={!selectedOpenAiPresetId}
              >
                <PixelIcon size={14} pixels={iconTrash} class="inline-block mr-1" />
                {$t('settings.openai_preset_delete')}
              </button>
            </div>

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="btn farm-btn-secondary w-full flex-1"
                on:click={setDefaultOpenAiPreset}
                disabled={!selectedOpenAiPresetId}
              >
                {$t('settings.openai_preset_set_default')}
              </button>
              <button
                type="button"
                class="btn farm-btn-secondary w-full flex-1"
                on:click={applyDefaultOpenAiPreset}
                disabled={!defaultOpenAiPresetId}
              >
                {$t('settings.openai_preset_apply_default')}
              </button>
            </div>

            {#if defaultOpenAiPresetId}
                <div class="text-xs text-[color:var(--pa-ink-soft)] mt-2 leading-5">
                  {$t('settings.openai_preset_default_label')}: {openAiPresets.find((preset) => preset.id === defaultOpenAiPresetId)?.name || $t('settings.openai_preset_custom')}
                </div>
            {/if}

            <div class="flex gap-2 mt-2">
              <button
                type="button"
                class="btn farm-btn-water w-full flex-1"
                on:click={exportOpenAiPresets}
                disabled={openAiPresets.length === 0}
              >
                {$t('settings.openai_preset_export')}
              </button>
              <button
                type="button"
                class="btn farm-btn-water w-full flex-1"
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
                <div class="text-xs text-[color:var(--pa-ink-soft)] mt-2 leading-5">{presetNotice}</div>
              {/if}
          </div>

          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_base_url"
            >{$t('settings.base_url')}</label>
              <input
                id="openai_base_url"
                type="text"
                class="w-full outline-none text-sm placeholder-gray-400 text-[color:var(--pa-bark)]"
              placeholder="https://api.openai.com/v1"
              bind:value={config.openaiBaseUrl}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_model_text"
            >{$t('settings.text_model')}</label>
              <input
                id="openai_model_text"
                type="text"
                class="w-full outline-none text-sm placeholder-gray-400 text-[color:var(--pa-bark)]"
              placeholder="gpt-5.4"
              bind:value={config.openaiModelText}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_model_vision"
            >{$t('settings.vision_model_optional')}</label>
              <input
                id="openai_model_vision"
                type="text"
                class="w-full outline-none text-sm placeholder-gray-400 text-[color:var(--pa-bark)]"
              placeholder="Reuse text model if empty"
              bind:value={config.openaiModelVision}
              on:input={() => (isSaved = false)}
            />
          </div>

          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="openai_reasoning_effort"
            >{$t('settings.reasoning_effort')}</label>
            <select
              id="openai_reasoning_effort"
              class="w-full outline-none text-sm text-[color:var(--pa-bark)]"
              bind:value={config.openaiReasoningEffort}
              on:change={() => (isSaved = false)}
            >
              <option value="none">{$t('settings.reasoning_effort_none')}</option>
              <option value="low">{$t('settings.reasoning_effort_low')}</option>
              <option value="medium">{$t('settings.reasoning_effort_medium')}</option>
              <option value="high">{$t('settings.reasoning_effort_high')}</option>
              <option value="xhigh">{$t('settings.reasoning_effort_xhigh')}</option>
            </select>
            <p class="mt-2 text-xs leading-5 text-[color:var(--pa-ink-soft)]">
              {$t('settings.reasoning_effort_hint')}
            </p>
          </div>
        {/if}

        {#if config.provider === 'doubao'}
          <div
            class="panel-paper pixel-reading-surface px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="doubao_ep_text">{$t('settings.endpoint_id_text')}</label
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
            class="panel-paper px-3 py-3 w-full"
            transition:slide={{duration: 200}}
          >
            <label
              class="block font-bold mb-1 text-sm"
              for="doubao_ep_vision">{$t('settings.endpoint_id_vision')}</label
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

        <div class="panel-paper pixel-reading-surface px-3 py-3 w-full">
          <label
            class="flex items-center gap-1.5 font-bold mb-1 text-sm"
            for="api_key"
            title="Your LLM provider key (stored locally only)"
          >
             <PixelIcon size={14} pixels={iconKey} />
           {$t('settings.key_label')}
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

        {#if testNotice}
          <div
            class={`panel-paper pixel-reading-surface px-3 py-3 text-sm ${
              testNoticeType === 'success'
                ? 'text-emerald-800'
                : testNoticeType === 'error'
                  ? 'text-red-700'
                  : 'text-[color:var(--pa-ink-soft)]'
            }`}
          >
            {testNotice}
          </div>
        {/if}

        {#if diagnosticStages.length > 0}
          <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm space-y-2">
            {#each diagnosticStages as stage}
              <div class="flex items-start justify-between gap-3 border-b border-black/10 pb-2 last:border-b-0 last:pb-0">
                <div class="min-w-0">
                  <div class="font-pixel-ui text-xs text-[color:var(--pa-ink-soft)]">
                    {getStageLabel(stage.key)} · {stage.endpoint}
                  </div>
                  <div class="mt-1 break-words leading-6">
                    {getStageMessage(stage)}
                  </div>
                </div>
                <span class={`farm-badge shrink-0 ${
                  stage.status === 'success'
                    ? '!bg-[linear-gradient(180deg,#dff8b8,#8ebb4f)]'
                    : stage.status === 'error'
                      ? '!bg-[linear-gradient(180deg,#f6c0a9,#d87258)] text-[color:var(--pa-ink-inverse)]'
                      : '!bg-[linear-gradient(180deg,#f5edd3,#d8c8a0)]'
                }`}>
                  {getStageStatusLabel(stage.status)}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="flex gap-2">
          <button
            type="button"
            class="btn farm-btn-water w-full flex-1"
            on:click={testConnection}
            disabled={isTesting}
          >
            {isTesting ? $t('settings.testing_connection') : $t('settings.test_connection')}
          </button>
          <button
            class={`btn w-full flex-1 ${isSaved ? 'farm-btn-secondary' : ''}`}
            on:click={save}
          >
            {isSaved ? $t('btn.saved') : $t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
