<script lang="ts">
  import {fade, slide} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import {createEventDispatcher} from 'svelte';

  import Header from '../Header.svelte';
  import PdfQaPanel from '../PdfQaPanel.svelte';
  import ApiSetting from '../settings/ApiSetting.svelte';
  import TocSettings from '../settings/TocSetting.svelte';
  import PageSelector from '../PageSelector.svelte';
  import TocEditor from '../TocEditor.svelte';
  import {Sparkles, X} from 'lucide-svelte';
  import {curFileFingerprint} from '../../stores';

  import type {ChapterSourceFormat, QaChapterReference, QaPanelMessage} from '$lib/types/pdf-qa';

  export let pdfState: any;
  export let originalPdfInstance: any;
  export let tocPdfInstance: any;
  export let isAiLoading = false;
  export let aiError: string | null = null;
  export let showNextStepHint = false;

  export let tocRanges: {start: number; end: number; id: string}[];
  export let activeRangeIndex: number;
  export let addPhysicalTocPage: boolean;
  export let isTocConfigExpanded: boolean;
  export let activeMode: 'toc' | 'qa' = 'toc';

  export let config: any;
  export let customApiConfig: any;
  export let tocPageCount: number;
  export let isPreviewMode: boolean;
  export let qaUploadState: 'idle' | 'uploading' | 'processing' | 'ready' | 'error' | 'cancelled' = 'idle';
  export let qaUploadError: string | null = null;
  export let qaPageCount = 0;
  export let qaTextPageCount = 0;
  export let qaProcessedPageCount = 0;
  export let qaCurrentPage: number | null = null;
  export let qaPageRanges: {start: number; end: number; id: string}[] = [];
  export let qaActiveRangeIndex = 0;
  export let isQaAsking = false;
  export let qaMessages: QaPanelMessage[] = [];
  export let qaChapters: QaChapterReference[] = [];
  export let qaCurrentChapter: QaChapterReference | null = null;
  export let qaChapterFormat: ChapterSourceFormat = 'markdown';

  const dispatch = createEventDispatcher();
  export let tocEditor: any = undefined;
</script>

<div class="w-full lg:w-[35%] flex-shrink-0">
  <Header on:openhelp={() => dispatch('openhelp')} />

  <ApiSetting
    on:change={(e) => dispatch('apiConfigChange', e.detail)}
    on:save={() => dispatch('apiConfigSave')}
  />

  {#if activeMode === 'toc'}
    <TocSettings
      {config}
      {tocPdfInstance}
      {tocRanges}
      totalPages={pdfState.totalPages}
      bind:isTocConfigExpanded
      bind:addPhysicalTocPage
      on:toggleExpand={() => (isTocConfigExpanded = !isTocConfigExpanded)}
      on:updateField={(e) => dispatch('updateField', e.detail)}
      on:jumpToTocPage={() => dispatch('jumpToTocPage')}
    />
  {/if}

  {#if activeMode === 'toc' && showNextStepHint && originalPdfInstance}
    <div
      class="relative border-black border-2 rounded-lg p-3 my-4 bg-yellow-200 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
      transition:fade={{duration: 200}}
    >
      <button
        class="absolute top-1 right-1 p-1 hover:bg-black/10 rounded-full transition-colors"
        on:click={() => dispatch('closeNextStepHint')}
        title={$t('btn.close_hint')}
      >
        <X size={16} />
      </button>
      <h3 class="font-bold mb-2">{$t('hint.next_step_title')}:</h3>
      <p class="text-sm text-gray-800">
        1. {$t('hint.step_1_text')} <strong class="text-black">{$t('hint.step_1_bold')}</strong>
      </p>
      <p class="text-sm text-gray-800 mt-1">
        2. {$t('hint.step_2_text')} <strong class="text-black">{$t('hint.step_2_bold')}</strong>
      </p>
      <p class="text-sm text-gray-800 mt-2">
        {$t('hint.or_text')} <strong class="text-black">{$t('hint.manual_add_bold')}</strong>
        {$t('hint.manual_add_text')}
      </p>
    </div>
  {/if}

  {#if originalPdfInstance && activeMode === 'toc'}
    <div transition:fade={{duration: 200}}>
      <PageSelector
        bind:tocRanges
        bind:activeRangeIndex
        totalPages={pdfState.totalPages}
        title={$t('label.toc_pages_selection')}
        addRangeTitle={$t('label.add_range')}
        on:addRange
        on:removeRange
        on:setActiveRange
        on:rangeChange={() => dispatch('rangeChange')}
      />
    </div>
  {/if}

  {#if originalPdfInstance && activeMode === 'qa'}
    <div transition:fade={{duration: 200}}>
      <PageSelector
        tocRanges={qaPageRanges}
        activeRangeIndex={qaActiveRangeIndex}
        totalPages={pdfState.totalPages}
        title={$t('qa.page_selection_title')}
        addRangeTitle={$t('label.add_range')}
        on:addRange={() => dispatch('addQaRange')}
        on:removeRange={(e) => dispatch('removeQaRange', e.detail)}
        on:setActiveRange={(e) => dispatch('setQaActiveRange', e.detail)}
        on:rangeChange={() => dispatch('qaRangeChange')}
      />
    </div>
  {/if}

  {#key $curFileFingerprint}
    {#if activeMode === 'qa'}
      <PdfQaPanel
        hasPdf={!!originalPdfInstance}
        uploadState={qaUploadState}
        uploadError={qaUploadError}
        pageCount={qaPageCount || pdfState.totalPages}
        textPageCount={qaTextPageCount}
        processedPageCount={qaProcessedPageCount}
        currentPage={qaCurrentPage}
        pageRanges={qaPageRanges}
        activePageRangeIndex={qaActiveRangeIndex}
        isAsking={isQaAsking}
        messages={qaMessages}
        chapters={qaChapters}
        currentChapter={qaCurrentChapter}
        initialChapterFormat={qaChapterFormat}
        on:ask={(e) => dispatch('askPdf', e.detail)}
        on:jumpToPage={(e) => dispatch('jumpToQaPage', e.detail)}
        on:clearHistory={() => dispatch('clearQaHistory')}
      />
    {/if}
  {/key}

  {#if activeMode === 'toc'}
    <button
      class="btn w-full my-2 font-bold bg-blue-400 transition-all duration-300 text-black border-2 border-black rounded-lg px-3 py-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] disabled:bg-gray-300 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
      on:click={() => dispatch('generateAi')}
      title={isAiLoading
        ? $t('status.generating')
        : !originalPdfInstance
          ? $t('status.load_pdf_first')
          : $t('tooltip.generate_ai')}
      disabled={isAiLoading || !originalPdfInstance}
    >
      {#if isAiLoading}
        <span>{$t('btn.generating')}</span>
      {:else}
        <span>
          <Sparkles
            size={16}
            class="inline-block mr-1"
          />
          {$t('btn.generate_toc_ai')}</span
        >
      {/if}
    </button>
  {/if}

  {#if activeMode === 'toc' && aiError}
    <div class="my-2 p-3 bg-red-100 border-2 border-red-700 text-red-700 rounded-lg">
      {aiError}
    </div>
  {/if}

  {#if activeMode === 'toc'}
    {#key $curFileFingerprint}
      <TocEditor
        on:hoveritem
        on:jumpToPage={(e) => dispatch('jumpToPage', e.detail)}
        on:aiFormatResponse
        bind:this={tocEditor}
        currentPage={pdfState.currentPage}
        isPreview={isPreviewMode}
        pageOffset={config.pageOffset}
        insertAtPage={config.insertAtPage}
        apiConfig={customApiConfig}
        {tocPageCount}
      />
    {/key}
  {/if}
</div>
