<script context="module" lang="ts">
  export type {QaPanelMessage} from '$lib/types/pdf-qa';
</script>

<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import {MessageSquare, Loader2, FileText, Trash2, ChevronRight, ChevronDown, Bug} from 'lucide-svelte';

  import type {
    ChapterSourceFormat,
    QaChapterReference,
    QaPanelMessage,
    QaScope,
  } from '$lib/types/pdf-qa';

  type QaUploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'error' | 'cancelled';
  type PageRangeFilter = {start: number; end: number} | null;
  type ChapterSearchResultGroup = {label: string; chapters: QaChapterReference[]};
  type HighlightSegment = {text: string; match: boolean};

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseChapterSearchQuery(rawValue: string): {text: string; pageRange: PageRangeFilter} {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return {text: '', pageRange: null};
    }

    let remaining = trimmed;
    let pageRange: PageRangeFilter = null;

    const rangeMatch = trimmed.match(/(?:^|\s)(?:p(?:age)?|页)?\s*:?\s*(\d+)\s*(?:-|~|to|–|—)\s*(\d+)(?=\s|$)/i);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      pageRange = {start: Math.min(start, end), end: Math.max(start, end)};
      remaining = `${trimmed.slice(0, rangeMatch.index || 0)} ${trimmed.slice((rangeMatch.index || 0) + rangeMatch[0].length)}`
        .replace(/\s{2,}/g, ' ')
        .trim();
    } else {
      const singlePageMatch = trimmed.match(/(?:^|\s)(?:p(?:age)?|页)\s*:?\s*(\d+)(?=\s|$)/i);
      if (singlePageMatch) {
        const page = Number(singlePageMatch[1]);
        pageRange = {start: page, end: page};
        remaining = `${trimmed.slice(0, singlePageMatch.index || 0)} ${trimmed.slice((singlePageMatch.index || 0) + singlePageMatch[0].length)}`
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    }

    return {
      text: remaining.toLowerCase(),
      pageRange,
    };
  }

  function chapterMatchesPageRange(chapter: QaChapterReference, pageRange: PageRangeFilter): boolean {
    if (!pageRange) return true;
    return chapter.endPage >= pageRange.start && chapter.startPage <= pageRange.end;
  }

  function getHighlightSegments(text: string, query: string): HighlightSegment[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [{text, match: false}];
    }

    const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig');
    const segments = text.split(regex).filter((segment) => segment.length > 0);

    return segments.map((segment) => ({
      text: segment,
      match: segment.toLowerCase() === normalizedQuery.toLowerCase(),
    }));
  }

  function groupChapters(chapters: QaChapterReference[]): ChapterSearchResultGroup[] {
    const groups = new Map<string, QaChapterReference[]>();

    for (const chapter of chapters) {
      const label = chapter.path[0] || chapter.title;
      const existing = groups.get(label);

      if (existing) {
        existing.push(chapter);
      } else {
        groups.set(label, [chapter]);
      }
    }

    return Array.from(groups.entries())
      .map(([label, groupedChapters]) => ({
        label,
        chapters: [...groupedChapters].sort((a, b) => a.startPage - b.startPage || a.level - b.level),
      }))
      .sort((a, b) => {
        const firstA = a.chapters[0]?.startPage || 0;
        const firstB = b.chapters[0]?.startPage || 0;
        return firstA - firstB;
      });
  }

  export let hasPdf = false;
  export let uploadState: QaUploadState = 'idle';
  export let uploadError: string | null = null;
  export let pageCount = 0;
  export let textPageCount = 0;
  export let processedPageCount = 0;
  export let currentPage: number | null = null;
  export let pageRanges: {start: number; end: number; id: string}[] = [];
  export let activePageRangeIndex = 0;
  export let isAsking = false;
  export let messages: QaPanelMessage[] = [];
  export let chapters: QaChapterReference[] = [];
  export let currentChapter: QaChapterReference | null = null;
  export let initialChapterFormat: ChapterSourceFormat = 'markdown';

  const dispatch = createEventDispatcher<{
    ask: {question: string; scope: QaScope};
    jumpToPage: {page: number};
    clearHistory: void;
  }>();

  let scopeMode: 'current-page' | 'page-range' | 'chapter' = 'current-page';
  let question = '';
  let chapterFormat: ChapterSourceFormat = initialChapterFormat;
  let selectedChapterId = '__current__';
  let chapterSearch = '';
  let collapsedGroupLabels: string[] = [];

  $: selectedChapter = selectedChapterId === '__current__'
    ? currentChapter
    : chapters.find((chapter) => chapter.id === selectedChapterId) || null;
  $: parsedChapterSearch = parseChapterSearchQuery(chapterSearch);
  $: normalizedChapterSearch = parsedChapterSearch.text;
  $: filteredChapters = chapters.filter((chapter) => {
    const chapterPath = chapter.path.join(' > ').toLowerCase();
    const matchesText = !normalizedChapterSearch || chapterPath.includes(normalizedChapterSearch);
    const matchesPageRange = chapterMatchesPageRange(chapter, parsedChapterSearch.pageRange);
    return matchesText && matchesPageRange;
  });
  $: selectableChapters = selectedChapterId !== '__current__' && selectedChapter && !filteredChapters.some((chapter) => chapter.id === selectedChapter.id)
    ? [selectedChapter, ...filteredChapters]
    : filteredChapters;
  $: groupedFilteredChapters = groupChapters(filteredChapters);
  $: collapsedGroupLabels = collapsedGroupLabels.filter((label) => groupedFilteredChapters.some((group) => group.label === label));
  $: if (!hasPdf || (selectedChapterId !== '__current__' && !chapters.some((chapter) => chapter.id === selectedChapterId))) {
    selectedChapterId = '__current__';
  }

  function formatPageRangeLabel(start: number, end: number): string {
    return start === end
      ? $t('qa.meta_current_page', {values: {page: start}})
      : $t('qa.meta_page_range', {values: {start, end}});
  }

  function toggleGroupCollapse(label: string) {
    collapsedGroupLabels = collapsedGroupLabels.includes(label)
      ? collapsedGroupLabels.filter((item) => item !== label)
      : [...collapsedGroupLabels, label];
  }

  function submitQuestion() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || uploadState !== 'ready' || isAsking) return;

    if (scopeMode === 'current-page') {
      if (!currentPage) return;

      dispatch('ask', {
        question: trimmedQuestion,
        scope: {mode: 'current-page', page: currentPage},
      });
    } else if (scopeMode === 'page-range') {
      if (pageRanges.length === 0) return;

      dispatch('ask', {
        question: trimmedQuestion,
        scope: pageRanges.length === 1
          ? {mode: 'page-range', startPage: pageRanges[0].start, endPage: pageRanges[0].end}
          : {mode: 'page-ranges', ranges: pageRanges.map(({start, end}) => ({startPage: start, endPage: end}))},
      });
    } else {
      if (!selectedChapter) return;

      dispatch('ask', {
        question: trimmedQuestion,
        scope: {
          mode: 'chapter',
          chapter: selectedChapter,
          sourceFormat: chapterFormat,
        },
      });
    }

    question = '';
  }

  $: statusLabel = (() => {
    if (uploadState === 'uploading') return $t('qa.uploading_short');
    if (uploadState === 'processing') return $t('qa.processing_short');
    if (uploadState === 'ready') return $t('qa.ready_short');
    if (uploadState === 'cancelled') return $t('qa.cancelled_short');
    if (uploadState === 'error') return $t('qa.error_short');
    return $t('qa.idle_short');
  })();

  $: activePageRange = pageRanges[activePageRangeIndex] || null;
  $: canAskCurrentPage = uploadState === 'ready' && currentPage !== null;
  $: canAskChapter = uploadState === 'ready' && selectedChapter !== null;
  $: canAskPageRange = uploadState === 'ready' && pageRanges.length > 0;
  $: askDisabled =
    !question.trim() ||
    uploadState !== 'ready' ||
    isAsking ||
    (scopeMode === 'current-page' && !canAskCurrentPage) ||
    (scopeMode === 'page-range' && !canAskPageRange) ||
    (scopeMode === 'chapter' && !canAskChapter);
</script>

<div class="border-black border-2 rounded-lg p-3 my-4 bg-emerald-50 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="font-bold flex items-center gap-2">
        <MessageSquare size={16} />
        {$t('qa.title')}
      </h3>
      <p class="text-xs text-gray-600 mt-1">{$t('qa.subtitle')}</p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="p-1.5 rounded border border-black bg-white hover:bg-red-100 disabled:opacity-40"
        on:click={() => dispatch('clearHistory')}
        disabled={messages.length === 0}
        title={$t('qa.clear_history')}
      >
        <Trash2 size={14} />
      </button>
      <span class="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-black bg-white">
        {statusLabel}
      </span>
    </div>
  </div>

  <div class="mt-3 rounded-md border-2 border-black bg-white px-3 py-2 text-sm">
    {#if !hasPdf}
      <p class="text-gray-600">{$t('qa.idle')}</p>
    {:else if uploadState === 'uploading'}
      <div class="flex items-center gap-2 text-gray-700">
        <Loader2 size={14} class="animate-spin" />
        <span>{$t('qa.uploading')}</span>
      </div>
    {:else if uploadState === 'processing'}
      <div class="flex items-center gap-2 text-gray-700">
        <Loader2 size={14} class="animate-spin" />
        <span>{$t('qa.processing', {values: {processed: processedPageCount, pageCount}})}</span>
      </div>
    {:else if uploadState === 'cancelled'}
      <p class="text-amber-700 font-medium">{$t('qa.processing_cancelled')}</p>
    {:else if uploadState === 'error'}
      <p class="text-red-700 font-medium">{uploadError || $t('qa.error')}</p>
    {:else if uploadState === 'ready'}
      <div class="flex items-start gap-2 text-gray-700">
        <FileText size={14} class="mt-0.5 flex-shrink-0" />
        <p>{$t('qa.ready_hint', {values: {textPages: textPageCount, pageCount}})}</p>
      </div>
    {:else}
      <p class="text-gray-600">{$t('qa.idle')}</p>
    {/if}

  </div>




  <div class="mt-3 grid grid-cols-3 gap-2">
    <button
      class="flex-1 border-2 border-black rounded-md px-3 py-2 text-sm font-bold transition-colors"
      class:bg-black={scopeMode === 'current-page'}
      class:text-white={scopeMode === 'current-page'}
      class:bg-white={scopeMode !== 'current-page'}
      on:click={() => (scopeMode = 'current-page')}
      type="button"
    >
      {$t('qa.scope_current')}
    </button>
    <button
      class="flex-1 border-2 border-black rounded-md px-3 py-2 text-sm font-bold transition-colors"
      class:bg-black={scopeMode === 'page-range'}
      class:text-white={scopeMode === 'page-range'}
      class:bg-white={scopeMode !== 'page-range'}
      on:click={() => (scopeMode = 'page-range')}
      type="button"
    >
      {$t('qa.scope_range')}
    </button>
    <button
      class="flex-1 border-2 border-black rounded-md px-3 py-2 text-sm font-bold transition-colors"
      class:bg-black={scopeMode === 'chapter'}
      class:text-white={scopeMode === 'chapter'}
      class:bg-white={scopeMode !== 'chapter'}
      on:click={() => (scopeMode = 'chapter')}
      type="button"
    >
      {$t('qa.scope_chapter')}
    </button>
  </div>

  {#if scopeMode === 'current-page'}
    <div class="mt-3 border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
      {#if currentPage !== null}
        <span class="text-gray-700">{$t('qa.current_page_label')}: <strong>{currentPage}</strong></span>
      {:else}
        <span class="text-amber-700">{$t('qa.current_page_unavailable')}</span>
      {/if}
    </div>
  {:else if scopeMode === 'page-range'}
    <div class="mt-3 border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
      {#if pageRanges.length > 0}
        <div class="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">{$t('qa.page_selection_title')}</div>
        <div class="space-y-1">
          {#each pageRanges as range, index}
            <div class:text-black={index === activePageRangeIndex} class:text-gray-600={index !== activePageRangeIndex} class="text-sm">
              <span class="font-bold mr-1">{index + 1}.</span>{formatPageRangeLabel(range.start, range.end)}
            </div>
          {/each}
        </div>
        {#if activePageRange}
          <div class="text-xs text-gray-500 mt-2">{$t('qa.page_range_active_hint', {values: {start: activePageRange.start, end: activePageRange.end}})}</div>
        {/if}
      {:else}
        <span class="text-amber-700">{$t('qa.page_selection_empty')}</span>
      {/if}
    </div>
  {:else}
    <div class="mt-3 space-y-2">
      <div class="border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
        <label class="text-xs font-bold text-gray-600 block mb-1" for="qa-chapter-search">
          {$t('qa.chapter_search_label')}
        </label>
        <input
          id="qa-chapter-search"
          type="text"
          bind:value={chapterSearch}
          placeholder={$t('qa.chapter_search_placeholder')}
          class="w-full border-2 border-black rounded-md px-2 py-1.5 text-sm bg-white"
        />
        <div class="text-xs text-gray-500 mt-2">{$t('qa.chapter_search_help')}</div>
        {#if parsedChapterSearch.pageRange}
          <div class="text-xs text-emerald-700 mt-1">
            {$t('qa.chapter_search_range_active', {values: {start: parsedChapterSearch.pageRange.start, end: parsedChapterSearch.pageRange.end}})}
          </div>
        {/if}
        <div class="text-xs text-gray-500 mt-2">
          {$t('qa.chapter_search_count', {values: {visible: filteredChapters.length, total: chapters.length}})}
        </div>
      </div>

      <div class="border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
        <label class="text-xs font-bold text-gray-600 block mb-1" for="qa-chapter-select">
          {$t('qa.chapter_selector_label')}
        </label>
        <select
          id="qa-chapter-select"
          bind:value={selectedChapterId}
          class="w-full border-2 border-black rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="__current__">{$t('qa.chapter_selector_auto')}</option>
          {#each selectableChapters as chapter}
            <option value={chapter.id}>{chapter.path.join(' > ')}</option>
          {/each}
        </select>
        {#if chapters.length > 0 && filteredChapters.length === 0}
          <div class="text-xs text-amber-700 mt-2">{$t('qa.chapter_search_empty')}</div>
        {/if}
      </div>

      {#if filteredChapters.length > 0}
        <div class="border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
          <div class="flex items-center justify-between gap-3 mb-2">
            <div class="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {$t('qa.chapter_results_label')}
            </div>
            <div class="text-[11px] text-gray-500">{$t('qa.chapter_results_sorted')}</div>
          </div>

          <div class="max-h-48 overflow-y-auto space-y-3 pr-1">
            {#each groupedFilteredChapters as group}
              <div>
                <button
                  type="button"
                  class="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 hover:text-black"
                  on:click={() => toggleGroupCollapse(group.label)}
                >
                  <span class="flex items-center gap-1.5">
                    {#if collapsedGroupLabels.includes(group.label)}
                      <ChevronRight size={13} />
                    {:else}
                      <ChevronDown size={13} />
                    {/if}
                    <span>{group.label}</span>
                  </span>
                  <span>{group.chapters.length}</span>
                </button>

                {#if !collapsedGroupLabels.includes(group.label)}
                  <div class="space-y-2">
                    {#each group.chapters as chapter}
                      <button
                        type="button"
                        class="w-full text-left border rounded-md px-3 py-2 transition-colors"
                        class:border-black={chapter.id === selectedChapter?.id}
                        class:bg-yellow-100={chapter.id === selectedChapter?.id}
                        class:bg-stone-50={chapter.id !== selectedChapter?.id}
                        class:hover:bg-yellow-50={chapter.id !== selectedChapter?.id}
                        on:click={() => (selectedChapterId = chapter.id)}
                      >
                        <div
                          class="font-bold text-sm text-gray-800"
                          style={`padding-left: ${Math.max(chapter.level - 1, 0) * 12}px`}
                        >
                          {#each getHighlightSegments(chapter.title, normalizedChapterSearch) as segment}
                            {#if segment.match}
                              <mark class="bg-yellow-300 px-0.5 rounded-sm">{segment.text}</mark>
                            {:else}
                              {segment.text}
                            {/if}
                          {/each}
                        </div>
                        <div class="text-xs text-gray-600 mt-1 break-words">
                          {#each getHighlightSegments(chapter.path.join(' > '), normalizedChapterSearch) as segment}
                            {#if segment.match}
                              <mark class="bg-yellow-200 px-0.5 rounded-sm">{segment.text}</mark>
                            {:else}
                              {segment.text}
                            {/if}
                          {/each}
                        </div>
                        <div class="text-[11px] text-gray-500 mt-1">
                          {$t('qa.chapter_page_range', {values: {start: chapter.startPage, end: chapter.endPage}})}
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="border-2 border-black rounded-md bg-white px-3 py-2 text-sm">
        {#if selectedChapter}
          <div class="font-bold text-gray-800">{selectedChapter.title}</div>
          <div class="text-xs text-gray-600 mt-1">{selectedChapter.path.join(' > ')}</div>
          <div class="text-xs text-gray-600 mt-1">
            {$t('qa.chapter_page_range', {values: {start: selectedChapter.startPage, end: selectedChapter.endPage}})}
          </div>
          {#if selectedChapterId === '__current__'}
            <div class="text-xs text-gray-500 mt-1">{$t('qa.chapter_selector_following')}</div>
          {/if}
        {:else}
          <span class="text-amber-700">{$t('qa.current_chapter_unavailable')}</span>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="border-2 border-black rounded-md px-3 py-2 text-sm font-bold"
          class:bg-black={chapterFormat === 'markdown'}
          class:text-white={chapterFormat === 'markdown'}
          class:bg-white={chapterFormat !== 'markdown'}
          on:click={() => (chapterFormat = 'markdown')}
        >
          {$t('qa.chapter_markdown')}
        </button>
        <button
          type="button"
          class="border-2 border-black rounded-md px-3 py-2 text-sm font-bold"
          class:bg-black={chapterFormat === 'latex'}
          class:text-white={chapterFormat === 'latex'}
          class:bg-white={chapterFormat !== 'latex'}
          on:click={() => (chapterFormat = 'latex')}
        >
          {$t('qa.chapter_latex')}
        </button>
      </div>
    </div>
  {/if}

  <div class="mt-3">
    <textarea
      bind:value={question}
      rows="4"
      placeholder={$t('qa.question_placeholder')}
      class="w-full border-2 border-black rounded-md px-3 py-2 text-sm bg-white resize-y focus:outline-none focus:ring-2 focus:ring-black/20"
    ></textarea>
    <button
      class="mt-2 w-full font-bold transition-all duration-200 text-black border-2 border-black rounded-md px-3 py-2 bg-emerald-300 hover:bg-emerald-200 disabled:bg-gray-200 disabled:shadow-none"
      on:click={submitQuestion}
      disabled={askDisabled}
      type="button"
    >
      {#if isAsking}
        {$t('qa.asking')}
      {:else}
        {$t('qa.ask')}
      {/if}
    </button>
  </div>

  <div class="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
    {#if messages.length === 0}
      <div class="border-2 border-dashed border-black/40 rounded-md px-3 py-4 text-sm text-gray-600 bg-white/70">
        {$t('qa.messages_empty')}
      </div>
    {:else}
      {#each messages as message (message.id)}
        <div class="rounded-md border-2 border-black px-3 py-2 bg-white">
          <div class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
            {message.role === 'user' ? $t('qa.you') : $t('qa.assistant')}
          </div>
          {#if message.meta}
            <div class="text-[11px] text-gray-500 mb-1">
              {message.meta.label}
              {#if message.meta.sourceFormat}
                · {$t(message.meta.sourceFormat === 'latex' ? 'qa.chapter_latex' : 'qa.chapter_markdown')}
              {/if}
              {#if typeof message.meta.cacheHit === 'boolean'}
                ·
                <span class={message.meta.cacheHit ? 'text-emerald-700' : 'text-amber-700'}>
                  <Bug size={11} class="inline-block align-[-1px] mr-0.5" />
                  {$t(message.meta.cacheHit ? 'qa.cache_hit' : 'qa.cache_miss')}
                </span>
              {/if}
            </div>
          {/if}
          <p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>

          {#if message.citations && message.citations.length > 0}
            <div class="mt-2 pt-2 border-t border-black/10">
              <div class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{$t('qa.source_pages')}</div>
              <div class="flex flex-wrap gap-2">
                {#each message.citations as citation}
                  <button
                    type="button"
                    class="text-xs border border-black rounded-full px-2 py-1 bg-stone-50 hover:bg-yellow-100"
                    title={citation.snippet || $t('qa.jump_to_page', {values: {page: citation.page}})}
                    on:click={() => dispatch('jumpToPage', {page: citation.page})}
                  >
                    {$t('qa.jump_to_page', {values: {page: citation.page}})}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
