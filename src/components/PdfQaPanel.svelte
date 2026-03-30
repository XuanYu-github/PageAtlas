<script context="module" lang="ts">
  export type {QaPanelMessage} from '$lib/types/pdf-qa';
</script>

<script lang="ts">
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import type {
    ChapterSourceFormat,
    QaAttachment,
    QaChapterReference,
    QaPanelMessage,
    QaScope,
  } from '$lib/types/pdf-qa';
  import PixelIcon from './icons/PixelIcon.svelte';
  import PixelCard from './pixel/PixelCard.svelte';
  import PixelInput from './pixel/PixelInput.svelte';
  import PixelSelect from './pixel/PixelSelect.svelte';
  import {iconBook, iconBrain, iconChevronDown, iconChevronRight, iconPencil, iconQuestion, iconSave, iconTrash, iconUpload} from './icons';

  type QaUploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'error' | 'cancelled';
  type PageRangeFilter = {start: number; end: number} | null;
  type ChapterSearchResultGroup = {label: string; chapters: QaChapterReference[]};
  type HighlightSegment = {text: string; match: boolean};
  type AttachmentDraft = QaAttachment;

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

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInlineMarkdown(value: string): string {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }

  function renderMarkdown(value: string): string {
    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';

    const blocks = normalized.split(/\n{2,}/);

    return blocks
      .map((block) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
        }

        if (lines.every((line) => /^\d+\.\s+/.test(line))) {
          return `<ol>${lines.map((line) => `<li>${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
        }

        const heading = block.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          return `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`;
        }

        if (block.startsWith('```') && block.endsWith('```')) {
          const code = block.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '');
          return `<pre><code>${escapeHtml(code)}</code></pre>`;
        }

        return `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br>')}</p>`;
      })
      .join('');
  }

  async function copyText(value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  function setActionFeedback(messageId: string, action: 'copy' | 'edit') {
    actionFeedback = {messageId, action};

    window.setTimeout(() => {
      if (actionFeedback?.messageId === messageId && actionFeedback.action === action) {
        actionFeedback = null;
      }
    }, 1600);
  }

  async function filesToAttachments(fileList: FileList | File[]): Promise<AttachmentDraft[]> {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));

    const nextAttachments = await Promise.all(files.map((file, index) => new Promise<AttachmentDraft>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `${Date.now()}-${index}-${file.name}`,
          name: file.name,
          dataUrl: typeof reader.result === 'string' ? reader.result : '',
          mimeType: file.type || 'image/png',
          kind: 'upload',
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));

    return nextAttachments.filter((attachment) => attachment.dataUrl);
  }

  async function appendAttachments(fileList: FileList | File[]) {
    const next = await filesToAttachments(fileList);
    attachments = [...attachments, ...next].slice(0, 4);
  }

  async function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && file.type.startsWith('image/'));

    if (files.length === 0) return;
    event.preventDefault();
    await appendAttachments(files);
  }

  function removeAttachment(id: string) {
    attachments = attachments.filter((attachment) => attachment.id !== id);
  }

  function beginEditMessage(message: QaPanelMessage) {
    if (!message.scope) return;
    question = message.content;
    attachments = (message.attachments || []).filter((attachment) => attachment.kind === 'upload');
    editingMessageId = message.id;
    editingScope = message.scope;
    setActionFeedback(message.id, 'edit');
    questionInput?.focus();
  }

  function clearComposer() {
    question = '';
    attachments = [];
    editingMessageId = null;
    editingScope = null;
    if (attachmentInput) attachmentInput.value = '';
  }

  function getAttachmentLabel(attachment: QaAttachment): string {
    if (attachment.kind === 'page-thumbnail' && attachment.page) {
      return $t('qa.jump_to_page', {values: {page: attachment.page}});
    }

    return attachment.name;
  }

  export let hasPdf = false;
  export let uploadState: QaUploadState = 'idle';
  export let uploadError: string | null = null;
  export let pageCount = 0;
  export let textPageCount = 0;
  export let processedPageCount = 0;
  export let currentPage: number | null = null;
  export let viewerPage: number | null = null;
  export let pageRanges: {start: number; end: number; id: string}[] = [];
  export let activePageRangeIndex = 0;
  export let isAsking = false;
  export let messages: QaPanelMessage[] = [];
  export let chapters: QaChapterReference[] = [];
  export let currentChapter: QaChapterReference | null = null;
  export let initialChapterFormat: ChapterSourceFormat = 'markdown';

  const dispatch = createEventDispatcher<{
    ask: {question: string; scope: QaScope; attachments?: QaAttachment[]; replaceMessageId?: string};
    jumpToPage: {page: number};
    clearHistory: void;
  }>();

  let scopeMode: 'current-page' | 'page-range' | 'chapter' = 'current-page';
  let question = '';
  let questionInput: HTMLTextAreaElement | null = null;
  let attachmentInput: HTMLInputElement | null = null;
  let chapterFormat: ChapterSourceFormat = initialChapterFormat;
  let selectedChapterId = '__current__';
  let chapterSearch = '';
  let collapsedGroupLabels: string[] = [];
  let attachments: AttachmentDraft[] = [];
  let editingMessageId: string | null = null;
  let editingScope: QaScope | null = null;
  let actionFeedback: {messageId: string; action: 'copy' | 'edit'} | null = null;

  $: resolvedCurrentPage = currentPage ?? viewerPage;

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

    const scopedTarget = editingScope;

    if (scopedTarget) {
      dispatch('ask', {
        question: trimmedQuestion,
        scope: scopedTarget,
        attachments,
        replaceMessageId: editingMessageId || undefined,
      });
    } else if (scopeMode === 'current-page') {
      if (!resolvedCurrentPage) return;

      dispatch('ask', {
        question: trimmedQuestion,
        scope: {mode: 'current-page', page: resolvedCurrentPage},
        attachments,
      });
    } else if (scopeMode === 'page-range') {
      if (pageRanges.length === 0) return;

      dispatch('ask', {
        question: trimmedQuestion,
        scope: pageRanges.length === 1
          ? {mode: 'page-range', startPage: pageRanges[0].start, endPage: pageRanges[0].end}
          : {mode: 'page-ranges', ranges: pageRanges.map(({start, end}) => ({startPage: start, endPage: end}))},
        attachments,
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
        attachments,
      });
    }

    clearComposer();
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
  $: canAskCurrentPage = uploadState === 'ready' && resolvedCurrentPage !== null;
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

<div class="panel-field p-3 my-4 space-y-3">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="farm-section-title !mb-0">
        <PixelIcon size={18} pixels={iconQuestion} />
        {$t('qa.title')}
      </h3>
      <p class="farm-subtitle mt-1">{$t('qa.subtitle')}</p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="farm-icon-button w-9 h-9 disabled:opacity-40"
        on:click={() => dispatch('clearHistory')}
        disabled={messages.length === 0}
        title={$t('qa.clear_history')}
      >
        <PixelIcon size={14} pixels={iconTrash} />
      </button>
      <span class="farm-badge">
        {statusLabel}
      </span>
    </div>
  </div>

  <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm">
    {#if !hasPdf}
      <p class="text-[color:var(--pa-bark)] leading-6">{$t('qa.idle')}</p>
    {:else if uploadState === 'uploading'}
      <div class="flex items-center gap-2 text-[color:var(--pa-bark)]">
        <div class="pixel-spinner"></div>
        <span>{$t('qa.uploading')}</span>
      </div>
    {:else if uploadState === 'processing'}
      <div class="flex items-center gap-2 text-[color:var(--pa-bark)]">
        <div class="pixel-spinner"></div>
        <span>{$t('qa.processing', {values: {processed: processedPageCount, pageCount}})}</span>
      </div>
    {:else if uploadState === 'cancelled'}
      <p class="text-amber-700 font-medium">{$t('qa.processing_cancelled')}</p>
    {:else if uploadState === 'error'}
      <p class="text-red-700 font-medium">{uploadError || $t('qa.error')}</p>
    {:else if uploadState === 'ready'}
      <div class="flex items-start gap-2 text-[color:var(--pa-bark)]">
        <PixelIcon size={16} pixels={iconBook} color="var(--pa-bark)" />
        <p class="leading-6">{$t('qa.ready_hint', {values: {textPages: textPageCount, pageCount}})}</p>
      </div>
    {:else}
      <p class="text-[color:var(--pa-bark)] leading-6">{$t('qa.idle')}</p>
    {/if}

  </div>




  <div class="grid grid-cols-3 gap-2">
    <button
      class="farm-tab flex-1 px-3 py-2 text-sm font-bold"
      class:is-active={scopeMode === 'current-page'}
      on:click={() => (scopeMode = 'current-page')}
      type="button"
    >
      {$t('qa.scope_current')}
    </button>
    <button
      class="farm-tab flex-1 px-3 py-2 text-sm font-bold"
      class:is-active={scopeMode === 'page-range'}
      on:click={() => (scopeMode = 'page-range')}
      type="button"
    >
      {$t('qa.scope_range')}
    </button>
    <button
      class="farm-tab flex-1 px-3 py-2 text-sm font-bold"
      class:is-active={scopeMode === 'chapter'}
      on:click={() => (scopeMode = 'chapter')}
      type="button"
    >
      {$t('qa.scope_chapter')}
    </button>
  </div>

  {#if scopeMode === 'current-page'}
    <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm">
      {#if resolvedCurrentPage !== null}
        <span class="text-gray-700">{$t('qa.current_page_label')}: <strong>{resolvedCurrentPage}</strong></span>
      {:else}
        <span class="text-amber-700">{$t('qa.current_page_unavailable')}</span>
      {/if}
    </div>
  {:else if scopeMode === 'page-range'}
      <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm">
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
      <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm">
        <label class="text-xs font-bold text-gray-600 block mb-1" for="qa-chapter-search">
          {$t('qa.chapter_search_label')}
        </label>
        <PixelInput
          id="qa-chapter-search"
          type="text"
          bind:value={chapterSearch}
          placeholder={$t('qa.chapter_search_placeholder')}
          class="text-sm"
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

      <div class="panel-paper pixel-reading-surface px-3 py-3 text-sm">
        <label class="text-xs font-bold text-gray-600 block mb-1" for="qa-chapter-select">
          {$t('qa.chapter_selector_label')}
        </label>
        <PixelSelect
          id="qa-chapter-select"
          bind:value={selectedChapterId}
          class="text-sm"
        >
          <option value="__current__">{$t('qa.chapter_selector_auto')}</option>
          {#each selectableChapters as chapter}
            <option value={chapter.id}>{chapter.path.join(' > ')}</option>
          {/each}
        </PixelSelect>
        {#if chapters.length > 0 && filteredChapters.length === 0}
          <div class="text-xs text-amber-700 mt-2">{$t('qa.chapter_search_empty')}</div>
        {/if}
      </div>

      {#if filteredChapters.length > 0}
        <PixelCard class="px-3 py-2 text-sm">
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
                      <PixelIcon size={13} pixels={iconChevronRight} />
                    {:else}
                      <PixelIcon size={13} pixels={iconChevronDown} />
                    {/if}
                    <span>{group.label}</span>
                  </span>
                  <span>{group.chapters.length}</span>
                </button>

                {#if !collapsedGroupLabels.includes(group.label)}
                  <div class="space-y-2">
                    {#each group.chapters as chapter}
                      <PixelCard
                        tag="button"
                        type="button"
                        variant={chapter.id === selectedChapter?.id ? 'water' : 'paper'}
                        class="w-full text-left px-3 py-2 transition-colors"
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
                      </PixelCard>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </PixelCard>
      {/if}

      <PixelCard class="px-3 py-2 text-sm">
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
      </PixelCard>

      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="farm-tab px-3 py-2 text-sm font-bold"
          class:is-active={chapterFormat === 'markdown'}
          on:click={() => (chapterFormat = 'markdown')}
        >
          {$t('qa.chapter_markdown')}
        </button>
        <button
          type="button"
          class="farm-tab px-3 py-2 text-sm font-bold"
          class:is-active={chapterFormat === 'latex'}
          on:click={() => (chapterFormat = 'latex')}
        >
          {$t('qa.chapter_latex')}
        </button>
      </div>
    </div>
  {/if}

  <div class="mt-3 space-y-2">
    {#if editingMessageId}
      <div class="panel-paper pixel-reading-surface px-3 py-2 text-xs flex items-center justify-between gap-2">
        <span>{$t('qa.editing_message')}</span>
        <button type="button" class="farm-badge" on:click={clearComposer}>{$t('qa.cancel_edit')}</button>
      </div>
    {/if}

    {#if attachments.length > 0}
      <div class="grid grid-cols-2 gap-2">
        {#each attachments as attachment}
          <div class="panel-paper pixel-reading-surface p-2 relative">
            <img src={attachment.dataUrl} alt={attachment.name} class="w-full h-24 object-cover border border-black/10" />
            <div class="mt-1 text-[10px] break-all text-gray-600">{attachment.name}</div>
            <button
              type="button"
              class="farm-icon-button absolute top-2 right-2 w-7 h-7"
              on:click={() => removeAttachment(attachment.id)}
              title={$t('settings.remove')}
            >
              <PixelIcon size={10} pixels={iconTrash} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <textarea
      bind:this={questionInput}
      bind:value={question}
      rows="4"
      placeholder={$t('qa.question_placeholder')}
      class="w-full px-3 py-3 text-sm resize-y"
      on:paste={handlePaste}
      on:keydown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          submitQuestion();
        }
      }}
    ></textarea>
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <button type="button" class="btn farm-btn-secondary min-h-10 px-3 text-xs" on:click={() => attachmentInput?.click()}>
          <PixelIcon size={14} pixels={iconUpload} />
          {$t('qa.upload_image')}
        </button>
        <span class="text-[11px] text-gray-500">{$t('qa.paste_image_hint')}</span>
      </div>
      <input
        bind:this={attachmentInput}
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        on:change={async (event) => {
          const input = event.currentTarget as HTMLInputElement;
          if (input.files) {
            await appendAttachments(input.files);
          }
          input.value = '';
        }}
      />
    </div>
    <button
      class="btn farm-btn-water mt-3 w-full"
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
      <div class="panel-paper pixel-reading-surface border-dashed px-3 py-4 text-sm text-gray-600 bg-white/70">
        {$t('qa.messages_empty')}
      </div>
    {:else}
      {#each messages as message (message.id)}
        <div class="panel-paper pixel-reading-surface px-3 py-3">
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
                  <PixelIcon size={11} pixels={iconBrain} class="inline-block align-[-1px] mr-0.5" />
                  {$t(message.meta.cacheHit ? 'qa.cache_hit' : 'qa.cache_miss')}
                </span>
              {/if}
            </div>
          {/if}
          {#if message.attachments && message.attachments.length > 0}
            <div class="mb-2 grid grid-cols-2 gap-2">
              {#each message.attachments as attachment}
                <div class="panel-paper px-2 py-2 bg-white/60">
                  <img src={attachment.dataUrl} alt={attachment.name} class="w-full h-24 object-cover border border-black/10" />
                  <div class="mt-1 text-[10px] text-gray-600 break-all">{getAttachmentLabel(attachment)}</div>
                </div>
              {/each}
            </div>
          {/if}

          {#if message.format === 'markdown' && message.role === 'assistant'}
            <div class="qa-markdown text-sm break-words">{@html renderMarkdown(message.content)}</div>
          {:else}
            <p class="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          {/if}

          <div class="mt-2 flex flex-wrap gap-2 text-[11px]">
            <button
              type="button"
              class="farm-badge transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              on:click={async () => {
                await copyText(message.content);
                setActionFeedback(message.id, 'copy');
              }}
            >
              {#if actionFeedback?.messageId === message.id && actionFeedback.action === 'copy'}
                {$t('tooltip_common.copied')}
              {:else}
                {$t('qa.copy_message')}
              {/if}
            </button>
            {#if message.role === 'user'}
              <button
                type="button"
                class={`farm-badge transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
                  editingMessageId === message.id ? 'ring-2 ring-[color:var(--pa-accent-gold-light)]' : ''
                }`}
                on:click={() => beginEditMessage(message)}
              >
                {#if editingMessageId === message.id}
                  {$t('qa.editing_message')}
                {:else if actionFeedback?.messageId === message.id && actionFeedback.action === 'edit'}
                  {$t('qa.editing_message')}
                {:else}
                  {$t('qa.edit_message')}
                {/if}
              </button>
            {/if}
          </div>

          {#if message.citations && message.citations.length > 0}
            <div class="mt-2 pt-2 border-t border-black/10">
              <div class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{$t('qa.source_pages')}</div>
              <div class="flex flex-wrap gap-2">
                {#each message.citations as citation}
                  <button
                    type="button"
                    class="farm-badge text-xs"
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

<style>
  .qa-markdown :global(p) {
    margin: 0 0 0.75rem;
    line-height: 1.7;
  }

  .qa-markdown :global(ul),
  .qa-markdown :global(ol) {
    margin: 0 0 0.75rem 1.1rem;
    padding: 0;
  }

  .qa-markdown :global(li) {
    margin: 0.2rem 0;
  }

  .qa-markdown :global(code) {
    padding: 0.05rem 0.3rem;
    background: rgba(77, 45, 23, 0.08);
    border: 1px solid rgba(77, 45, 23, 0.12);
  }

  .qa-markdown :global(pre) {
    margin: 0 0 0.75rem;
    padding: 0.75rem;
    overflow-x: auto;
    background: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(77, 45, 23, 0.12);
  }

  .qa-markdown :global(h1),
  .qa-markdown :global(h2),
  .qa-markdown :global(h3),
  .qa-markdown :global(h4),
  .qa-markdown :global(h5),
  .qa-markdown :global(h6) {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
  }

  .qa-markdown :global(a) {
    text-decoration: underline;
  }
</style>
