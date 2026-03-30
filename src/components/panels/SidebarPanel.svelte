<script lang="ts">
  import {fade, slide} from 'svelte/transition';
  import {t} from 'svelte-i18n';
  import {createEventDispatcher} from 'svelte';

  import Header from '../Header.svelte';
  import PdfQaPanel from '../PdfQaPanel.svelte';
  import PixelButton from '../pixel/PixelButton.svelte';
  import PixelPanel from '../pixel/PixelPanel.svelte';
  import PixelSidebar from '../pixel/PixelSidebar.svelte';
  import ApiSetting from '../settings/ApiSetting.svelte';
  import TocSettings from '../settings/TocSetting.svelte';
  import PageSelector from '../PageSelector.svelte';
  import TocEditor from '../TocEditor.svelte';
  import {curFileFingerprint} from '../../stores';
  import PixelIcon from '../icons/PixelIcon.svelte';
  import {iconClose, iconSparkle} from '../icons/index';

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
  export let activeMode: 'toc' | 'qa' | 'api' = 'toc';

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

<PixelSidebar class="w-full lg:w-full flex-shrink-0 workshop-sidebar p-4 md:p-5 text-[color:var(--pa-bark)]">
  <Header on:openhelp={() => dispatch('openhelp')} />

  {#if activeMode === 'api'}
    <ApiSetting
      isExpanded={true}
      on:change={(e) => dispatch('apiConfigChange', e.detail)}
      on:save={() => dispatch('apiConfigSave')}
      on:notify={(e) => dispatch('notify', e.detail)}
    />
  {/if}

  {#if activeMode === 'toc'}
    <div class="space-y-3">
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
    </div>
  {/if}

  {#if activeMode === 'toc' && showNextStepHint && originalPdfInstance}
    <div
      class="pixel-notice p-4 my-4"
      transition:fade={{duration: 200}}
    >
      <button
        class="absolute top-2 right-2 farm-icon-button w-8 h-8"
        on:click={() => dispatch('closeNextStepHint')}
        title={$t('btn.close_hint')}
      >
        <PixelIcon size={16} pixels={iconClose} />
      </button>
      <h3 class="farm-section-title !mb-2"><PixelIcon size={16} pixels={iconSparkle} /> {$t('hint.next_step_title')}:</h3>
      <p class="text-sm text-[color:var(--pa-ink)] leading-6">
        1. {$t('hint.step_1_text')} <strong class="text-black">{$t('hint.step_1_bold')}</strong>
      </p>
      <p class="text-sm text-[color:var(--pa-ink)] mt-1 leading-6">
        2. {$t('hint.step_2_text')} <strong class="text-black">{$t('hint.step_2_bold')}</strong>
      </p>
      <p class="text-sm text-[color:var(--pa-ink)] mt-2 leading-6">
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
          totalPages={qaPageCount || originalPdfInstance?.numPages || pdfState.totalPages}
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
        viewerPage={pdfState.currentPage}
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
    <PixelButton
      variant="water"
      class="w-full my-1"
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
          <PixelIcon size={16} pixels={iconSparkle} class="inline-block mr-1" />
          {$t('btn.generate_toc_ai')}</span
        >
      {/if}
    </PixelButton>
  {/if}

  {#if activeMode === 'toc' && aiError}
    <PixelPanel variant="dialog" class="my-2 p-3 !bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04)),repeating-linear-gradient(180deg,#f0b09a_0_8px,#bd5b45_8px_16px)] text-[color:var(--pa-ink-inverse)]">
      {aiError}
    </PixelPanel>
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
</PixelSidebar>
