<script lang="ts">
  import {browser} from '$app/environment';
  import {onMount, onDestroy, tick} from 'svelte';
  import {get} from 'svelte/store';
  import {fade, fly} from 'svelte/transition';
  import {t, isLoading} from 'svelte-i18n';
  import type * as PdfjsLibTypes from 'pdfjs-dist/legacy/build/pdf.mjs';
  import {init, trackEvent} from '@aptabase/web';

  import '../lib/i18n';
  import {pdfService, tocItems, curFileFingerprint, tocConfig, autoSaveEnabled, type TocConfig} from '../stores';
  import {PDFService, type PDFState, type TocItem} from '$lib/pdf/service';
  import {renderQueue} from '../lib/pdf/render-queue';
  import {setOutline} from '../lib/pdf/outliner';
  import {debounce} from '$lib';
  import {buildQaChapterReferences, findCurrentQaChapter} from '$lib/utils/chapter-qa';
  import {buildTree, convertPdfJsOutlineToTocItems, setNestedValue, findActiveTocPath, cleanTocItems} from '$lib/utils';
  import {generateToc} from '$lib/toc-service';
  import {applyCustomPrefix} from '$lib/utils/prefix';
  import {setPageLabels} from '$lib/pdf/page-labels';
  import {createBrowserAiConfig, loadBrowserAiConfigFromStorage} from '$lib/client/ai-config';

  import Toast from '../components/Toast.svelte';
  import AiLoadingModal from '../components/modals/AiLoadingModal.svelte';
  import OffsetModal from '../components/modals/OffsetModal.svelte';
  import HelpModal from '../components/modals/HelpModal.svelte';
  import StarRequestModal from '../components/modals/StarRequestModal.svelte';

  import SidebarPanel from '../components/panels/SidebarPanel.svelte';
  import PreviewPanel from '../components/panels/PreviewPanel.svelte';
  import SeoJsonLd from '../components/SeoJsonLd.svelte';

  import TocRelation from '../components/KnowledgeBoard.svelte';
  import PixelIcon from '../components/icons/PixelIcon.svelte';
  import {iconArrowLeft, iconBrain, iconChat, iconKey, iconList} from '../components/icons/index';

  import type {
    ChapterSourceFormat,
    QaAttachment,
    QaChapterReference,
    QaMessageMeta,
    QaPanelMessage,
    QaScope,
  } from '$lib/types/pdf-qa';
  import type {LocalQaPageText} from '$lib/client/pdf-qa';

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const TWO_SECONDS = 2000;

  let pdfjs: typeof PdfjsLibTypes | null = null;
  let PdfLib: typeof import('pdf-lib') | null = null;

  let isDragging = false;
  let isFileLoading = false;
  let isAiLoading = false;
  let isPreviewLoading = false;
  let isTocConfigExpanded = false;
  let showNextStepHint = false;
  let hasShownTocHint = false;

  let showGraphDrawer = false;
  let isGraphEntranceVisible = true;

  let showOffsetModal = false;
  let showHelpModal = false;
  let showStarRequestModal = false;
  let offsetPreviewPageNum = 1;

  let toastProps: {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
  } = {
    show: false,
    message: '',
    type: 'success',
    duration: 3000,
  };

  let originalPdfInstance: PdfjsLibTypes.PDFDocumentProxy | null = null;
  let tocPdfInstance: PdfjsLibTypes.PDFDocumentProxy | null = null;

  let pdfState: PDFState = {
    doc: null,
    newDoc: null,
    instance: null,
    filename: '',
    currentPage: 1,
    totalPages: 0,
    scale: 1.0,
  };

  let tocRanges = [{start: 1, end: 1, id: 'default'}];
  let activeRangeIndex = 0;
  let activeSidebarMode: 'toc' | 'qa' | 'api' = 'toc';
  let tocPageCount = 0;
  let addPhysicalTocPage = false;
  let isPreviewMode = false;
  let pendingTocItems: TocItem[] = [];
  let firstTocItem: TocItem | null = null;
  let aiError: string | null = null;
  let config: TocConfig;

  let lastPdfContentJson = '';
  let lastInsertAtPage = 2;
  let prefetchPageNum = 0;
  let previewAnchorPage = 0;
  let lastConfigJson = '';
  let currentTocPath: TocItem[] = [];
  let currentContentPage: number | null = null;
  let qaCurrentPage: number | null = null;

  let customApiConfig = createBrowserAiConfig();
  let tocEditor: any;

  type QaUploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'error' | 'cancelled';

  let qaLocalPages: LocalQaPageText[] = [];
  let qaUploadState: QaUploadState = 'idle';
  let qaUploadError: string | null = null;
  let qaPageCount = 0;
  let qaTextPageCount = 0;
  let qaProcessedPageCount = 0;
  let qaPageRanges = [{start: 1, end: 1, id: 'default'}];
  let qaActiveRangeIndex = 0;
  let qaRangeStart = 1;
  let qaRangeEnd = 1;
  let isQaAsking = false;
  let qaMessages: QaPanelMessage[] = [];
  let qaRequestVersion = 0;
  let qaChapterFormat: ChapterSourceFormat = 'markdown';
  let qaChapters: QaChapterReference[] = [];
  let qaCurrentChapter: QaChapterReference | null = null;

  function getQaHistoryStorageKey(fingerprint: string): string {
    return `pageatlas_qa_history_${fingerprint}`;
  }

  function loadQaHistory(fingerprint: string): QaPanelMessage[] {
    if (!browser) return [];

    const raw = localStorage.getItem(getQaHistoryStorageKey(fingerprint));
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveQaHistory(fingerprint: string, messages: QaPanelMessage[]) {
    if (!browser) return;
    localStorage.setItem(getQaHistoryStorageKey(fingerprint), JSON.stringify(messages));
  }

  function resetPdfQaState() {
    qaLocalPages = [];
    qaUploadState = 'idle';
    qaUploadError = null;
    qaPageCount = 0;
    qaTextPageCount = 0;
    qaProcessedPageCount = 0;
    qaPageRanges = [{start: 1, end: 1, id: 'default'}];
    qaActiveRangeIndex = 0;
    qaRangeStart = 1;
    qaRangeEnd = 1;
    isQaAsking = false;
    qaMessages = [];
    qaChapterFormat = 'markdown';
  }

  function getCurrentContentPage(): number | null {
    if (!pdfState.currentPage || pdfState.totalPages === 0) return null;

    if (!isPreviewMode || !addPhysicalTocPage) {
      return pdfState.currentPage;
    }

    const insertAt = config?.insertAtPage || 2;

    if (pdfState.currentPage < insertAt) {
      return pdfState.currentPage;
    }

    if (pdfState.currentPage < insertAt + tocPageCount) {
      return null;
    }

    return pdfState.currentPage - tocPageCount;
  }

  function getQaCurrentPage(): number | null {
    if (!pdfState.currentPage || pdfState.totalPages === 0) return null;

    const originalPageCount = originalPdfInstance?.numPages || 0;
    if (originalPageCount === 0) return null;

    if (!isPreviewMode || !addPhysicalTocPage) {
      return Math.min(pdfState.currentPage, originalPageCount);
    }

    const insertAt = config?.insertAtPage || 2;

    if (pdfState.currentPage < insertAt) {
      return pdfState.currentPage;
    }

    if (pdfState.currentPage < insertAt + tocPageCount) {
      return Math.min(pdfState.currentPage, originalPageCount);
    }

    return Math.min(pdfState.currentPage - tocPageCount, originalPageCount);
  }

  function contentPageToViewerPage(page: number): number {
    if (!isPreviewMode || !addPhysicalTocPage) {
      return page;
    }

    const insertAt = config?.insertAtPage || 2;
    return page >= insertAt ? page + tocPageCount : page;
  }

  function getPreviewStartPage(): number {
    const ranges = activeSidebarMode === 'qa' ? qaPageRanges : tocRanges;
    const rangeIndex = activeSidebarMode === 'qa' ? qaActiveRangeIndex : activeRangeIndex;
    const activeRange = ranges[rangeIndex] || ranges[0];
    const contentPage = activeRange?.start || pdfState.currentPage || 1;

    if (!addPhysicalTocPage) {
      return contentPage;
    }

    const insertAt = config?.insertAtPage || 2;
    return contentPage >= insertAt ? contentPage + tocPageCount : contentPage;
  }

  $: currentContentPage = getCurrentContentPage();
  $: qaCurrentPage = getQaCurrentPage();

  $: if (qaPageCount > 0) {
    qaPageRanges = qaPageRanges.map((range) => ({
      ...range,
      start: Math.max(1, Math.min(range.start, qaPageCount)),
      end: Math.max(Math.max(1, Math.min(range.start, qaPageCount)), Math.min(range.end, qaPageCount)),
    }));
  }

  $: if (qaActiveRangeIndex >= qaPageRanges.length) {
    qaActiveRangeIndex = Math.max(0, qaPageRanges.length - 1);
  }

  $: {
    const activeQaRange = qaPageRanges[qaActiveRangeIndex];
    if (activeQaRange) {
      qaRangeStart = activeQaRange.start;
      qaRangeEnd = activeQaRange.end;
    }
  }

  $: qaChapters = buildQaChapterReferences($tocItems, config?.pageOffset || 0, originalPdfInstance?.numPages || 0);
  $: qaCurrentChapter = findCurrentQaChapter(qaChapters, currentTocPath, currentContentPage);

  $: if (browser && $curFileFingerprint) {
    saveQaHistory($curFileFingerprint, qaMessages);
  }

  onMount(async () => {
    init('A-US-0422911470', {
      appVersion: '1.0.0',
    });

    trackEvent('app_started', {
      platform: 'web',
      version: '1.0.0',
    });
  });

  onMount(() => {
    $pdfService = new PDFService();
    customApiConfig = loadBrowserAiConfigFromStorage();
    isGraphEntranceVisible = true;

    // Global error handlers
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === 'RenderingCancelledException') {
        event.preventDefault();
        return;
      }
      const msg = event.reason?.message || event.reason || $t('toast.unknown_async_error');
      toastProps = {show: true, message: msg, type: 'error'};
      event.preventDefault();
    };

    const handleSyncError = (event: ErrorEvent) => {
      const msg = event.message || $t('toast.unknown_error');
      toastProps = {show: true, message: msg, type: 'error'};
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleSyncError);

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleSyncError);
    };
  });

  onDestroy(async () => {
    unsubscribeTocItems();
    if (originalPdfInstance) {
      try {
        await originalPdfInstance.destroy();
      } catch (e: any) {
        console.warn('Error destroying original instance:', e);
      }
    }
    if (tocPdfInstance) {
      try {
        await tocPdfInstance.destroy();
      } catch (e: any) {
        console.warn('Error destroying TOC instance:', e);
      }
    }
  });

  function getPdfEffectiveData(items: TocItem[]): any[] {
    return items.map((item) => ({
      title: item.title,
      to: item.to,
      children: item.children ? getPdfEffectiveData(item.children) : [],
    }));
  }

  // Only trigger updatePDF when config content actually changes, not just reference
  $: {
    config = $tocConfig;
    const currentConfigJson = JSON.stringify($tocConfig);

    if (isPreviewMode && !isFileLoading && lastConfigJson) {
      if (currentConfigJson !== lastConfigJson) {
        debouncedUpdatePDF();
      }
    }
    lastConfigJson = currentConfigJson;
  }

  $: currentTocPath = findActiveTocPath(
    $tocItems,
    pdfState.currentPage,
    $tocConfig.pageOffset || 0,
    addPhysicalTocPage,
    tocPageCount,
    config.insertAtPage,
  );

  $: if (showOffsetModal) {
    tick().then(() => renderOffsetPreviewPage(offsetPreviewPageNum));
  } else {
  }

  let previousAddPhysicalTocPage = addPhysicalTocPage;
  $: {
    if (pdfState.doc && previousAddPhysicalTocPage !== addPhysicalTocPage && !isFileLoading) {
      previousAddPhysicalTocPage = addPhysicalTocPage;
      if (!isPreviewMode) {
        togglePreviewMode();
      }
      toggleShowInsertTocHint();
      if (isPreviewMode) {
        debouncedUpdatePDF();
      }
    }
  }

  $: {
    if (
      showOffsetModal &&
      offsetPreviewPageNum > 0 &&
      offsetPreviewPageNum <= (originalPdfInstance?.numPages || 0) &&
      originalPdfInstance &&
      $pdfService
    ) {
      tick().then(() => renderOffsetPreviewPage(offsetPreviewPageNum));
    }
  }

  const debouncedUpdatePDF = debounce(updatePDF, 300);

  const toggleShowInsertTocHint = () => {
    if (!hasShownTocHint && addPhysicalTocPage && $tocItems.length > 0) {
      toastProps = {
        show: true,
        message: $t('toast.toc_insert_hint', {values: {page: config.insertAtPage || 2}}),
        type: 'info',
      };
      setTimeout(() => {
        hasShownTocHint = true;
      }, TWO_SECONDS);
    }
  };

  const unsubscribeTocItems = tocItems.subscribe((items) => {
    if (items.length > 0) showNextStepHint = false;
    if (isFileLoading) return;

    if (!isPreviewMode) return;

    toggleShowInsertTocHint();
    if (isDragging) return;
    const currentContentJson = JSON.stringify(getPdfEffectiveData(items));

    if (currentContentJson === lastPdfContentJson) {
      return;
    }

    lastPdfContentJson = currentContentJson;
    debouncedUpdatePDF();
  });

  const loadPdfLibraries = async () => {
    if (pdfjs && PdfLib) return;
    try {
      const [pdfjsModule, PdfLibModule] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdf-lib')
      ]);
      pdfjs = pdfjsModule;
      PdfLib = PdfLibModule;
    } catch (error: any) {
      console.error('Failed to load PDF libraries:', error);
      toastProps = {
        show: true,
        message: $t('toast.load_failed'),
        type: 'error',
      };
      throw new Error('Failed to load PDF libraries', {cause: error});
    }
  };

  function updateTocField(fieldPath: string, value: any) {
    tocConfig.update((cfg) => {
      return setNestedValue(cfg, fieldPath, value);
    });
  }

  const updateViewerInstance = () => {
    pdfState.instance = originalPdfInstance;
    if (isPreviewMode) {
      pdfState.totalPages = (originalPdfInstance?.numPages || 0) + tocPageCount;
    } else {
      pdfState.totalPages = originalPdfInstance?.numPages || 0;
    }
    pdfState = {...pdfState};
  };

  async function updatePDF(forceFull = false) {
    const isFull = !isPreviewMode || forceFull;
    if (!pdfState.doc || !$pdfService) return;
    isPreviewLoading = true;

    if (!pdfjs || !PdfLib) {
      console.error('PDF libraries not loaded.');
      toastProps = {show: true, message: $t('toast.components_not_loaded'), type: 'error'};
      return;
    }

    try {
      const settings = config.prefixSettings;
      const tocItems_ = settings.enabled ? applyCustomPrefix($tocItems, settings.configs) : $tocItems;

      let newDoc = pdfState.doc;

      const fontKey = config.fontFamily || 'huiwen';
      const isFontMissing = !PDFService.regularFontBytes.has(fontKey);
      if (isFontMissing) {
        const translate = get(t);
        toastProps = {
          show: true,
          message: translate('msg.font_loading', {values: {font: fontKey}}),
          type: 'info',
          duration: 100000,
        };
        isPreviewLoading = true;
      }

      const currentInsertPage = config.insertAtPage || 2;
      let tocBytes: Uint8Array | null = null;

      if (addPhysicalTocPage) {
        if (currentInsertPage !== lastInsertAtPage) {
          await $pdfService.initPreview(pdfState.doc);
          lastInsertAtPage = currentInsertPage;
        }

        const firstPage = pdfState.doc.getPages()[0];
        const pageSize = firstPage ? firstPage.getSize() : undefined;

        const res = await $pdfService.updateTocPages(tocItems_, config, !isFull, pageSize);
        newDoc = res.newDoc || pdfState.doc;
        tocPageCount = res.tocPageCount;
        tocBytes = res.tocBytes;

        if (isFontMissing) {
          if (PDFService.regularFontBytes.has(fontKey)) {
            toastProps = {
              show: true,
              message: $t('msg.font_loaded', {values: {font: fontKey}}),
              type: 'success',
              duration: 3000,
            };
          } else {
            toastProps = {
              show: true,
              message: $t('msg.font_load_failed', {values: {font: fontKey}}),
              type: 'error',
              duration: 5000,
            };
          }
        }
      } else {
        newDoc = await pdfState.doc.copy();
        tocPageCount = 0;
      }

      setOutline(newDoc!, tocItems_, config.pageOffset, tocPageCount);
      setPageLabels(newDoc!, config.pageLabelSettings);

      if (isFull) {
        const pdfBytes = await newDoc!.save({
          useObjectStreams: false,
        });
        pdfState.newDoc = newDoc;
      }

      if (tocBytes) {
        const loadingTask = pdfjs.getDocument({
          data: tocBytes,
          worker: PDFService.sharedWorker || undefined,
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
        });

        const newTocInstance = await loadingTask.promise;

        if (tocPdfInstance) {
          try {
            await tocPdfInstance.destroy();
          } catch (e) {
            console.warn('Error destroying old TOC instance:', e);
          }
        }

        tocPdfInstance = newTocInstance;
      } else {
        if (tocPdfInstance) {
          try {
            await tocPdfInstance.destroy();
          } catch (e) {}
        }
        tocPdfInstance = null;
      }

      if (isFull) {
        pdfState.newDoc = newDoc;
      }

      if (isPreviewMode) {
        pdfState.totalPages = (originalPdfInstance?.numPages || 0) + tocPageCount;

        if (pdfState.currentPage > pdfState.totalPages) {
          pdfState.currentPage = pdfState.totalPages;
        }
      } else {
        pdfState.totalPages = originalPdfInstance?.numPages || 0;
      }

      pdfState = {...pdfState};
    } catch (error: any) {
      console.error('Error updating PDF:', error);
      const msg =
        error.name === 'InvalidPDFException'
          ? $t('toast.pdf_corrupted')
          : error.message;
      toastProps = {show: true, message: $t('toast.error_updating_pdf', {values: {msg}}), type: 'error'};
    } finally {
      if (isPreviewLoading && !isFileLoading) {
        // Only reset if we are not in another loading state, though simply false is usually fine here
        isPreviewLoading = false;
      }
    }
  }

  const togglePreviewMode = async () => {
    if (!originalPdfInstance) return;

    if (!isPreviewMode) {
      isPreviewLoading = true;
      try {
        if (!tocPdfInstance) {
          await updatePDF();
        }

        isPreviewMode = true;
        previewAnchorPage = getPreviewStartPage();
        pdfState.currentPage = previewAnchorPage;
        toggleShowInsertTocHint();
        await tick();
      } catch (error: any) {
        console.error('Error generating preview:', error);
        toastProps = {show: true, message: $t('toast.error_generating_preview', {values: {msg: error.message}}), type: 'error'};
        isPreviewMode = false;
      } finally {
        isPreviewLoading = false;
      }
    } else {
      isPreviewMode = false;
    }

    updateViewerInstance();
  };

  const renderOffsetPreviewPage = async (pageNum: number) => {
    if (!originalPdfInstance || !showOffsetModal) return;

    const canvas = document.getElementById('offset-preview-canvas') as HTMLCanvasElement;
    if (canvas) {
      const pageId = `orig-${pageNum}`;
      // Use premium priority (0) for modal preview
      const bitmap = await renderQueue.enqueue(pageId, originalPdfInstance, pageNum, 0);

      const ctx = canvas.getContext('2d', {alpha: false});
      if (!ctx || !showOffsetModal) return;

      const containerHeight = canvas.parentElement?.clientHeight || 0;
      const containerWidth = canvas.parentElement?.clientWidth || 0;

      if (containerHeight === 0) {
        setTimeout(() => renderOffsetPreviewPage(pageNum), 50);
        return;
      }

      const aspectRatio = bitmap.width / bitmap.height;
      const displayHeight = containerHeight;
      const displayWidth = displayHeight * aspectRatio;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
      canvas.style.width = `${Math.floor(displayWidth)}px`;
      canvas.style.height = `${Math.floor(displayHeight)}px`;

      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }
  };

  const loadPdfFile = async (file: File) => {
    if (!file) return;

    const qaVersion = ++qaRequestVersion;
    const fingerprint = `${file.name}_${file.size}`;
    curFileFingerprint.set(fingerprint);
    localStorage.setItem('pageatlas_last_fingerprint', fingerprint);

    resetPdfQaState();
    qaMessages = loadQaHistory(fingerprint);

    renderQueue.clear();

    isFileLoading = true;
    autoSaveEnabled.set(false);
    showNextStepHint = false;
    hasShownTocHint = false;
    showOffsetModal = false;

    pendingTocItems = [];
    firstTocItem = null;

    tocItems.set([]);
    await tick();

    if (originalPdfInstance) {
      try {
        await originalPdfInstance.destroy();
      } catch (e: any) {
        console.warn('Error destroying original instance:', e);
      }
    }
    if (tocPdfInstance) {
      try {
        await tocPdfInstance.destroy();
      } catch (e: any) {
        console.warn('Error destroying TOC instance:', e);
      }
    }

    pdfState.instance = null;
    originalPdfInstance = null;
    tocPdfInstance = null;
    pdfState = {...pdfState};
    await tick();

    pdfState.filename = file.name;
    pdfState.totalPages = 0;
    let shouldDefaultToQa = false;

    try {
      await loadPdfLibraries();

      if (!pdfjs || !PdfLib) {
        return;
      }

      const {PDFDocument} = PdfLib;

      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      pdfState.doc = await PDFDocument.load(uint8Array);
      PDFService.sanitizePdfMetadata(pdfState.doc);

      if ($pdfService) {
        const initPage = config.insertAtPage || 2;
        lastInsertAtPage = initPage;
        await $pdfService.initPreview(pdfState.doc);

        const firstPage = pdfState.doc.getPage(1) || pdfState.doc.getPage(0);
        const {width} = firstPage.getSize();
        const autoLayout = PDFService.getAutoLayout(width);

        tocConfig.update((c) => ({
          ...c,
          firstLevel: {...c.firstLevel, fontSize: autoLayout.fontSizeL1},
          otherLevels: {...c.otherLevels, fontSize: autoLayout.fontSizeLOther},
        }));
      }

      const loadingTask = pdfjs.getDocument({
        data: uint8Array,
        worker: PDFService.sharedWorker || undefined,
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      });
      originalPdfInstance = await loadingTask.promise;

      tocPdfInstance = null;
      isPreviewMode = false;
      tocPageCount = 0;
      pdfState.currentPage = 1;
      tocRanges = [{start: 1, end: 1, id: 'default'}];
      activeRangeIndex = 0;

      const session = localStorage.getItem(`toc_draft_${fingerprint}`);
      if (session) {
        const {items, pageOffset} = JSON.parse(session);
        tocItems.set(cleanTocItems(items));
        updateTocField('pageOffset', pageOffset);
        shouldDefaultToQa = Array.isArray(items) && items.length > 0;
      } else {
        try {
          const existingOutline = await originalPdfInstance.getOutline();

          if (existingOutline && existingOutline.length > 0) {
            const importedItems = await convertPdfJsOutlineToTocItems(existingOutline, originalPdfInstance);
            tocItems.set(importedItems);
            updateTocField('pageOffset', 0);
            shouldDefaultToQa = importedItems.length > 0;

            toastProps = {show: true, message: $t('toast.raw_toc_imported'), type: 'info'};
          } else {
            tocItems.set([]);
            updateTocField('pageOffset', 0);
          }
        } catch (err: any) {
          console.warn('PDF load outline error:', err);
          tocItems.set([]);
          updateTocField('pageOffset', 0);
        }
      }

      lastPdfContentJson = JSON.stringify(getPdfEffectiveData($tocItems));

      // auto detect TOC pages
      if ($pdfService && originalPdfInstance) {
        const detected = await $pdfService.detectTocPages();
        if (detected.length > 0) {
          const start = Math.min(...detected);
          const end = Math.max(...detected);
          tocRanges = [{start, end, id: 'detected'}];
          activeRangeIndex = 0;
        }
      }

      activeSidebarMode = shouldDefaultToQa ? 'qa' : 'toc';

      void indexPdfForQa(qaVersion);
    } catch (error: any) {
      console.error('Error loading PDF:', error);
      toastProps = {show: true, message: $t('toast.error_loading_pdf', {values: {msg: error.message}}), type: 'error'};
    } finally {
      updateViewerInstance();
      await tick();
      isFileLoading = false;

      const hideHintUntil = localStorage.getItem('pageatlas_hide_next_step_hint_until');
      if (hideHintUntil && Date.now() < parseInt(hideHintUntil, 10)) {
        showNextStepHint = false;
      } else if (shouldDefaultToQa) {
        showNextStepHint = false;
      } else {
        showNextStepHint = true;
      }

      autoSaveEnabled.set(true);
    }
  };

  const exportPDF = async () => {
    try {
      let fileHandle;
      let writable;
      const isSupported = 'showSaveFilePicker' in window;

      if (isSupported) {
        try {
          fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: pdfState.filename.replace('.pdf', '_outlined.pdf'),
            types: [
              {
                description: 'PDF Document',
                accept: {'application/pdf': ['.pdf']},
              },
            ],
          });
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          throw err;
        }
      }

      toastProps = {show: true, message: $t('toast.exporting'), type: 'info'};

      await updatePDF(true);
      if (!pdfState.newDoc) {
        toastProps = {show: true, message: $t('toast.no_pdf_to_export'), type: 'error'};
        return;
      }
      const pdfBytes = await pdfState.newDoc.save();

      if (isSupported && fileHandle) {
        writable = await fileHandle.createWritable();
        await writable.write(pdfBytes);
        await writable.close();
      } else {
        const pdfBlob = new Blob([pdfBytes as any], {type: 'application/pdf'});
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = pdfState.filename.replace('.pdf', '_outlined.pdf');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toastProps = {show: true, message: $t('toast.export_success'), type: 'success'};

      setTimeout(() => {
        const isDismissed = localStorage.getItem('pageatlas_hide_star_request') === 'true';
        if (!isDismissed) {
          showStarRequestModal = true;
        }
      }, 1000);
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      toastProps = {show: true, message: $t('toast.error_exporting', {values: {msg: error.message}}), type: 'error'};
    }
  };

  const generateTocFromAI = async () => {
    showNextStepHint = false;

    if (!originalPdfInstance) {
      toastProps = {show: true, message: $t('toast.load_pdf_first'), type: 'error'};
      return;
    }

    isAiLoading = true;
    aiError = null;

    try {
      const res = await generateToc({
        pdfInstance: originalPdfInstance,
        ranges: tocRanges,
        apiKey: customApiConfig.apiKey,
        provider: customApiConfig.provider,
        doubaoEndpointIdText: customApiConfig.doubaoEndpointIdText,
        doubaoEndpointIdVision: customApiConfig.doubaoEndpointIdVision,
        openaiBaseUrl: customApiConfig.openaiBaseUrl,
        openaiModelText: customApiConfig.openaiModelText,
        openaiModelVision: customApiConfig.openaiModelVision,
      });

      if (!res || res.length === 0) {
        aiError = $t('toast.no_valid_toc');
        return;
      }

      const nestedTocItems = buildTree(res);

      pendingTocItems = nestedTocItems;
      firstTocItem = nestedTocItems.length > 0 ? nestedTocItems[0] : null;

      if (firstTocItem) {
        const lastTocPage = tocRanges[0]?.end || firstTocItem.to;
        offsetPreviewPageNum = Math.min(lastTocPage + 1, originalPdfInstance?.numPages || 1);
        showOffsetModal = true;
      } else {
        tocItems.set(nestedTocItems);
        pendingTocItems = [];
      }
    } catch (error: any) {
      console.error('Error generating ToC from AI:', error);
      aiError = error.message;
      toastProps = {show: true, message: error.message, type: 'error'};
    } finally {
      isAiLoading = false;
    }
  };
  
  const handleAiFormatResponse = (e: any) => {
    const { items } = e.detail;
    pendingTocItems = items;
    firstTocItem = items.length > 0 ? items[0] : null;

    if (firstTocItem) {
      offsetPreviewPageNum = Math.min(firstTocItem.to, originalPdfInstance?.numPages || 1);
      showOffsetModal = true;
    } else {
      if (tocEditor) tocEditor.saveHistory();
      tocItems.set(items);
    }
  };

  const handleOffsetConfirm = async () => {
    if (!firstTocItem) return;
    const labeledPage = firstTocItem.to;
    const physicalPage = offsetPreviewPageNum;
    const offset = physicalPage - labeledPage;
    updateTocField('pageOffset', offset);

    const hasChinese = pendingTocItems.some((item) => /[\u4e00-\u9fa5]/.test(item.title));
    const rootTitle = hasChinese ? '目录' : 'Contents';
    const firstTitleNormalized = pendingTocItems[0]?.title?.trim().toLowerCase();
    const isDuplicate =
      firstTitleNormalized === '目录' ||
      firstTitleNormalized === 'contents' ||
      firstTitleNormalized === 'table of contents';

    if (!isDuplicate) {
      const rootNode: TocItem = {
        id: `root-${Date.now()}`,
        title: rootTitle,
        to: (tocRanges[0]?.start || 1) - offset,
        children: [],
        open: true,
      };
      pendingTocItems.unshift(rootNode);
    }

    if (tocEditor) tocEditor.saveHistory();
    tocItems.set(pendingTocItems);
    showOffsetModal = false;
    pendingTocItems = [];
    firstTocItem = null;

    if (!isPreviewMode) {
      await togglePreviewMode();
    }
  };

  const handleOffsetSkip = () => {
    if (pendingTocItems.length > 0) {
      pendingTocItems.shift();
      firstTocItem = pendingTocItems.length > 0 ? pendingTocItems[0] : null;

      if (!firstTocItem) {
        showOffsetModal = false;
        tocItems.set([]);
      }
    }
  };

  const debouncedJumpToPage = debounce((page: number) => {
    if (page > 0 && page <= pdfState.totalPages) {
      pdfState.currentPage = page;
      pdfState = {...pdfState};
    }
  }, 300);

  const handleTocItemHover = (e: CustomEvent) => {
    if (!isPreviewMode) return;
    const logicalPage = e.detail.to as number;
    const physicalContentPage = logicalPage + config.pageOffset;
    if (physicalContentPage >= (config.insertAtPage || 2)) {
      prefetchPageNum = physicalContentPage + tocPageCount;
    } else {
      prefetchPageNum = physicalContentPage;
    }
    debouncedJumpToPage(prefetchPageNum);
  };

  const handleUpdateActiveRange = (e: CustomEvent) => {
    const {start, end} = e.detail;
    if (activeSidebarMode === 'qa') {
      if (qaActiveRangeIndex >= 0 && qaActiveRangeIndex < qaPageRanges.length) {
        if (start !== undefined) qaPageRanges[qaActiveRangeIndex].start = start;
        if (end !== undefined) qaPageRanges[qaActiveRangeIndex].end = end;
        qaPageRanges = [...qaPageRanges];
      }
    } else if (activeRangeIndex >= 0 && activeRangeIndex < tocRanges.length) {
      if (start !== undefined) tocRanges[activeRangeIndex].start = start;
      if (end !== undefined) tocRanges[activeRangeIndex].end = end;
      tocRanges = [...tocRanges];
    }
  };

  const handleAddRange = () => {
    const lastRange = tocRanges.length > 0 ? tocRanges[tocRanges.length - 1] : null;
    let nextStart = lastRange ? lastRange.end + 1 : pdfState.currentPage || 1;

    if (nextStart < 1) nextStart = 1;

    tocRanges = [
      ...tocRanges,
      {
        start: nextStart,
        end: nextStart,
        id: `range-${Date.now()}`,
      },
    ];
    activeRangeIndex = tocRanges.length - 1;
  };

  const handleRemoveRange = (e: CustomEvent) => {
    const {index} = e.detail;
    tocRanges = tocRanges.filter((_, i) => i !== index);
    if (activeRangeIndex >= tocRanges.length) {
      activeRangeIndex = Math.max(0, tocRanges.length - 1);
    }
  };

  const handleSetActiveRange = (e: CustomEvent) => {
    activeRangeIndex = e.detail.index;
  };

  const handleRangeChange = () => {
    tocRanges = [...tocRanges];
  };

  const handleAddQaRange = () => {
    const lastRange = qaPageRanges.length > 0 ? qaPageRanges[qaPageRanges.length - 1] : null;
    let nextStart = lastRange ? lastRange.end + 1 : qaCurrentPage || 1;

    if (nextStart < 1) nextStart = 1;

    qaPageRanges = [
      ...qaPageRanges,
      {
        start: nextStart,
        end: nextStart,
        id: `qa-range-${Date.now()}`,
      },
    ];
    qaActiveRangeIndex = qaPageRanges.length - 1;
  };

  const handleRemoveQaRange = (e: CustomEvent) => {
    const {index} = e.detail;
    qaPageRanges = qaPageRanges.filter((_, i) => i !== index);

    if (qaPageRanges.length === 0) {
      qaPageRanges = [{start: qaCurrentPage || 1, end: qaCurrentPage || 1, id: `qa-range-${Date.now()}`}];
      qaActiveRangeIndex = 0;
      return;
    }

    if (qaActiveRangeIndex >= qaPageRanges.length) {
      qaActiveRangeIndex = Math.max(0, qaPageRanges.length - 1);
    }
  };

  const handleSetQaActiveRange = (e: CustomEvent) => {
    qaActiveRangeIndex = e.detail.index;
  };

  const handleQaRangeChange = () => {
    qaPageRanges = [...qaPageRanges];
  };

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if ($tocItems.length > 0) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  };

  const jumpToPage = async (logicalPage: number) => {
    if (!isPreviewMode) {
      await togglePreviewMode();
    }
    const physicalContentPage = logicalPage + config.pageOffset;
    let targetPage: number;
    if (physicalContentPage >= (config.insertAtPage || 2)) {
      targetPage = physicalContentPage + tocPageCount;
    } else {
      targetPage = physicalContentPage;
    }
    debouncedJumpToPage(targetPage);
  };

  const jumpToContentPage = async (page: number) => {
    const targetPage = contentPageToViewerPage(page);

    if (targetPage <= 0 || targetPage > pdfState.totalPages) {
      toastProps = {show: true, message: $t('qa.jump_invalid'), type: 'error'};
      return;
    }

    if (!isPreviewMode) {
      await togglePreviewMode();
    }

    debouncedJumpToPage(targetPage);
  };

  const indexPdfForQa = async (version: number) => {
    if (!originalPdfInstance) return;

    qaUploadState = 'processing';
    qaUploadError = null;
    qaProcessedPageCount = 0;
    qaPageCount = originalPdfInstance.numPages;

    try {
      const {extractPdfPagesInBrowser} = await import('$lib/client/pdf-qa');

      const pages = await extractPdfPagesInBrowser(originalPdfInstance, {
        onPageCount: (pageCount) => {
          qaPageCount = pageCount;
        },
        onPageProcessed: (processedPageCount, pageCount) => {
          if (version !== qaRequestVersion) return;
          qaProcessedPageCount = processedPageCount;
          qaPageCount = pageCount;
        },
      });

      if (version !== qaRequestVersion) {
        return;
      }

      qaLocalPages = pages;
      qaUploadState = 'ready';
      qaTextPageCount = pages.filter((page) => page.charCount > 0).length;
      qaProcessedPageCount = pages.length;
                } catch (error: any) {
      if (version !== qaRequestVersion) {
        return;
      }

      qaUploadState = 'error';
      qaUploadError = error.message || $t('qa.upload_failed');
    }
  };

  async function buildQaPageThumbnailAttachments(scope: QaScope): Promise<QaAttachment[]> {
    if (!originalPdfInstance || !$pdfService) return [];

    const {selectPagesFromScope} = await import('$lib/client/pdf-qa');
    const selectedPages = selectPagesFromScope(scope, qaLocalPages).slice(0, 3);

    return await Promise.all(
      selectedPages.map(async (page) => ({
        id: `page-thumb-${page.page}-${Date.now()}`,
        name: `page-${page.page}.jpg`,
        dataUrl: await $pdfService!.getPageAsImage(originalPdfInstance, page.page, 0.55, 768),
        mimeType: 'image/jpeg',
        kind: 'page-thumbnail' as const,
        page: page.page,
      })),
    );
  }

  function replaceQaConversation(
    nextMessages: QaPanelMessage[],
    replaceMessageId?: string
  ): QaPanelMessage[] {
    if (!replaceMessageId) return nextMessages;

    return nextMessages.filter((message) =>
      message.id !== replaceMessageId && message.relatedUserMessageId !== replaceMessageId,
    );
  }

  const handlePdfQaAsk = async (event: CustomEvent<{
    question: string;
    scope: QaScope;
    attachments?: QaAttachment[];
    replaceMessageId?: string;
  }>) => {
    if (!originalPdfInstance || qaLocalPages.length === 0 || qaUploadState !== 'ready') {
      toastProps = {show: true, message: $t('qa.not_ready'), type: 'error'};
      return;
    }

    const {question, scope, attachments = [], replaceMessageId} = event.detail;
    const messageMeta = createQaMessageMeta(scope);
    const pageThumbnailAttachments = await buildQaPageThumbnailAttachments(scope);
    const userMessageId = replaceMessageId || `user-${Date.now()}`;
    const baseMessages = replaceQaConversation(qaMessages, replaceMessageId);
    const userMessage: QaPanelMessage = {
      id: userMessageId,
      role: 'user',
      content: question,
      meta: messageMeta,
      scope,
      attachments: [...attachments, ...pageThumbnailAttachments],
      format: 'plain',
    };

    qaMessages = [...baseMessages, userMessage];
    isQaAsking = true;

    try {
      const {askLocalPdfQuestion} = await import('$lib/client/pdf-qa');

      const result = await askLocalPdfQuestion({
        question,
        scope,
        pages: qaLocalPages,
        config: {
          apiKey: customApiConfig.apiKey,
          provider: customApiConfig.provider,
          doubaoEndpointIdText: customApiConfig.doubaoEndpointIdText,
          doubaoEndpointIdVision: customApiConfig.doubaoEndpointIdVision,
          openaiBaseUrl: customApiConfig.openaiBaseUrl,
          openaiModelText: customApiConfig.openaiModelText,
          openaiModelVision: customApiConfig.openaiModelVision,
        },
        getPageImage: (pageNumber) => $pdfService!.getPageAsImage(originalPdfInstance, pageNumber),
        userImages: attachments,
      });

      qaMessages = [
        ...baseMessages,
        userMessage,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          citations: result.citations || [],
          meta: messageMeta,
          relatedUserMessageId: userMessageId,
          format: 'markdown',
        },
      ];
    } catch (error: any) {
      toastProps = {show: true, message: error.message || $t('qa.ask_failed'), type: 'error'};
      qaMessages = [
        ...baseMessages,
        userMessage,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: error.message || $t('qa.ask_failed'),
          meta: messageMeta,
          relatedUserMessageId: userMessageId,
          format: 'plain',
        },
      ];
    } finally {
      isQaAsking = false;
    }
  };

  const handleClearQaHistory = () => {
    qaMessages = [];
  };

  const createQaMessageMeta = (scope: QaScope): QaMessageMeta => {
    switch (scope.mode) {
      case 'current-page':
        return {
          mode: 'page',
          label: $t('qa.meta_current_page', {values: {page: scope.page}}),
        };
      case 'page-range':
        return {
          mode: 'page',
          label: $t('qa.meta_page_range', {values: {start: scope.startPage, end: scope.endPage}}),
        };
      case 'page-ranges':
        return {
          mode: 'page',
          label: scope.ranges
            .map((range: {startPage: number; endPage: number}) => range.startPage === range.endPage
              ? `${range.startPage}`
              : `${range.startPage}-${range.endPage}`)
            .join(', '),
        };
      case 'chapter':
        return {
          mode: 'chapter',
          label: scope.chapter.path.join(' > '),
          sourceFormat: scope.sourceFormat,
        };
    }
  };

  const jumpToTocPage = async () => {
    if (!tocPdfInstance) {
      toastProps = {show: true, message: 'Please edit the ToC first to generate a preview.', type: 'error'};
      return;
    }
    if (!isPreviewMode) {
      await togglePreviewMode();
    }
    await tick();
    const targetPage = config.insertAtPage || 2;
    if (targetPage > 0 && targetPage <= pdfState.totalPages) {
      pdfState.currentPage = targetPage;
      pdfState = {...pdfState};
    } else {
      toastProps = {show: true, message: `Invalid ToC start page: ${targetPage}`, type: 'error'};
    }
  };

  function handleApiConfigChange(e: CustomEvent) {
    customApiConfig = e.detail;
  }

  function handleApiConfigSave() {
    toastProps = {show: true, message: 'API Settings Saved!', type: 'success'};
  }

  function handleApiConfigNotify(event: CustomEvent<{message: string; type: 'success' | 'error' | 'info'}>) {
    toastProps = {
      show: true,
      message: event.detail.message,
      type: event.detail.type,
    };
  }

  const handleCloseNextStepHint = () => {
    showNextStepHint = false;
    const expiry = Date.now() + THIRTY_DAYS;
    localStorage.setItem('pageatlas_hide_next_step_hint_until', expiry.toString());
  };

  const handleViewerMessage = (event: CustomEvent<{message: string; type: 'success' | 'error' | 'info'}>) => {
    toastProps = {show: true, message: event.detail.message, type: event.detail.type};
  };
</script>

{#if !showGraphDrawer && tocItems && isGraphEntranceVisible}
  <button
    transition:fly={{x: -50, duration: 300}}
    class="fixed -left-1 p-2 md:left-0 top-[16.25rem] z-40 inventory-card side-tool-button border-l-0 shadow-[var(--pa-shadow-stack-soft)] flex flex-col items-center justify-start gap-4 group w-[68px] min-h-[148px]"
    on:click={() => (showGraphDrawer = true)}
    title={$t('shell.graph_title')}
  >
    <PixelIcon size={18} pixels={iconBrain} class="mt-2" />
    <div class="side-tool-button__label writing-mode-vertical font-bold font-pixel-ui tracking-normal uppercase select-none">
      {$t('shell.graph_entry')}
    </div>
  </button>
{/if}

  <div
    class={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-300 ease-in-out ${showGraphDrawer ? 'translate-x-0' : '-translate-x-full'}`}
  >
    <div class="h-full w-[88vw] md:w-[560px] flex flex-col relative m-2 md:m-3 overflow-hidden">
      <button
        class="farm-icon-button absolute z-50 right-3 top-3"
        on:click={() => (showGraphDrawer = false)}
      >
        <PixelIcon size={20} pixels={iconArrowLeft} />
      </button>

      <div class="flex-1 overflow-hidden relative w-full h-full">
      {#key $curFileFingerprint}
        <TocRelation
          items={$tocItems}
          apiConfig={customApiConfig}
          onJumpToPage={jumpToPage}
          title={pdfState.filename ? `${pdfState.filename}`.replace('.pdf', '') : $t('viewer.no_file')}
        />
      {/key}
    </div>
  </div>

  {#if showGraphDrawer}
    <button
      type="button"
      aria-label="Close knowledge graph drawer"
      transition:fade={{duration: 200}}
      class="flex-1 bg-[rgba(60,40,24,0.42)] cursor-pointer"
      on:click={() => (showGraphDrawer = false)}
    ></button>
  {/if}
</div>

{#if toastProps.show}
  <Toast
    message={toastProps.message}
    type={toastProps.type}
    duration={toastProps.duration}
    on:close={() => (toastProps.show = false)}
  />
{/if}

{#if $isLoading}
  <div class="fixed inset-0 bg-white flex items-center justify-center z-50">
    <div class="pixel-spinner pixel-spinner--lg"></div>
  </div>
{:else}
  <h1 class="sr-only">{$t('meta.title')}</h1>

  <div
    class="farm-scene-grid workshop-shell mt-8 mb-8 mx-auto w-[95%] md:w-[90%] xl:w-[80%] 3xl:w-[75%] justify-between"
  >
    <div class="flex lg:hidden gap-2 w-full">
      <button
        type="button"
        class="farm-tab flex-1 px-3 py-3 font-bold flex items-center justify-center gap-2"
        class:is-active={activeSidebarMode === 'api'}
        on:click={() => (activeSidebarMode = 'api')}
      >
        <PixelIcon size={16} pixels={iconKey} />
        API
      </button>
      <button
        type="button"
        class="farm-tab flex-1 px-3 py-3 font-bold flex items-center justify-center gap-2"
        class:is-active={activeSidebarMode === 'qa'}
        on:click={() => (activeSidebarMode = 'qa')}
      >
        <PixelIcon size={16} pixels={iconChat} />
        {$t('qa.title')}
      </button>
      <button
        type="button"
        class="farm-tab flex-1 px-3 py-3 font-bold flex items-center justify-center gap-2"
        class:is-active={activeSidebarMode === 'toc'}
        on:click={() => (activeSidebarMode = 'toc')}
      >
        <PixelIcon size={16} pixels={iconList} />
        {$t('mode.toc')}
      </button>
    </div>

    <div class="hidden lg:flex flex-col gap-3 self-start sticky top-24 side-tool-post">
      <button
        type="button"
        class="inventory-card side-tool-button p-2 min-h-[136px] w-[72px] flex flex-col items-center justify-start gap-5"
        class:is-active={activeSidebarMode === 'qa'}
        class:brightness-95={activeSidebarMode !== 'qa'}
        on:click={() => (activeSidebarMode = 'qa')}
        title={$t('qa.title')}
      >
        <PixelIcon size={18} pixels={iconChat} class="mt-2" />
        <span class="side-tool-button__label writing-mode-vertical font-bold font-pixel-ui tracking-normal uppercase select-none">{$t('shell.qa_short')}</span>
      </button>
      <button
        type="button"
        class="inventory-card side-tool-button p-2 min-h-[136px] w-[72px] flex flex-col items-center justify-start gap-5"
        class:is-active={activeSidebarMode === 'toc'}
        class:brightness-95={activeSidebarMode !== 'toc'}
        on:click={() => (activeSidebarMode = 'toc')}
        title={$t('mode.toc')}
      >
        <PixelIcon size={18} pixels={iconList} class="mt-2" />
        <span class="side-tool-button__label writing-mode-vertical font-bold font-pixel-ui tracking-normal uppercase select-none">{$t('shell.toc_short')}</span>
      </button>
      <button
        type="button"
        class="inventory-card side-tool-button p-2 min-h-[136px] w-[72px] flex flex-col items-center justify-start gap-5"
        class:is-active={activeSidebarMode === 'api'}
        class:brightness-95={activeSidebarMode !== 'api'}
        on:click={() => (activeSidebarMode = 'api')}
        title={$t('settings.api_settings_title')}
      >
        <PixelIcon size={18} pixels={iconKey} class="mt-2" />
        <span class="side-tool-button__label writing-mode-vertical font-bold font-pixel-ui tracking-normal uppercase select-none">{$t('shell.api_entry')}</span>
      </button>
    </div>

    <SidebarPanel
      {pdfState}
      {originalPdfInstance}
      {tocPdfInstance}
      {isAiLoading}
      {aiError}
      {showNextStepHint}
      activeMode={activeSidebarMode}
      {config}
      {customApiConfig}
      {tocPageCount}
      {isPreviewMode}
      {qaUploadState}
      {qaUploadError}
      {qaPageCount}
      {qaTextPageCount}
      {qaProcessedPageCount}
      {qaCurrentPage}
      {qaPageRanges}
      {qaActiveRangeIndex}
      {isQaAsking}
      {qaMessages}
      {qaChapters}
      {qaCurrentChapter}
      {qaChapterFormat}
      bind:tocRanges
      bind:activeRangeIndex
      bind:addPhysicalTocPage
      bind:isTocConfigExpanded
      on:openhelp={() => (showHelpModal = true)}
      on:closeNextStepHint={handleCloseNextStepHint}
      on:apiConfigChange={handleApiConfigChange}
      on:apiConfigSave={handleApiConfigSave}
      on:notify={handleApiConfigNotify}
      on:updateField={(e) => updateTocField(e.detail.path, e.detail.value)}
      on:jumpToTocPage={jumpToTocPage}
      on:jumpToPage={(e) => {
        jumpToPage(e.detail.to);
      }}
      on:jumpToQaPage={(e) => jumpToContentPage(e.detail.page)}
      on:generateAi={generateTocFromAI}
      on:askPdf={handlePdfQaAsk}
      on:clearQaHistory={handleClearQaHistory}
      on:hoveritem={handleTocItemHover}
      on:fileselect={(e) => loadPdfFile(e.detail)}
      on:viewerMessage={handleViewerMessage}
      on:togglePreview={togglePreviewMode}
      on:export={exportPDF}
      on:addRange={handleAddRange}
      on:removeRange={handleRemoveRange}
      on:setActiveRange={handleSetActiveRange}
      on:rangeChange={handleRangeChange}
      on:addQaRange={handleAddQaRange}
      on:removeQaRange={handleRemoveQaRange}
      on:setQaActiveRange={handleSetQaActiveRange}
      on:qaRangeChange={handleQaRangeChange}
      on:updateActiveRange={handleUpdateActiveRange}
      on:aiFormatResponse={handleAiFormatResponse}
      bind:tocEditor
    />

    <PreviewPanel
      {isFileLoading}
      bind:pdfState
      {originalPdfInstance}
      {tocPdfInstance}
      {isPreviewMode}
      {isPreviewLoading}
      tocRanges={activeSidebarMode === 'qa' ? qaPageRanges : tocRanges}
      activeRangeIndex={activeSidebarMode === 'qa' ? qaActiveRangeIndex : activeRangeIndex}
      {tocPageCount}
      {addPhysicalTocPage}
      {jumpToTocPage}
      {currentTocPath}
      {prefetchPageNum}
      {previewAnchorPage}
      bind:isDragging
      on:fileselect={(e) => loadPdfFile(e.detail)}
      on:viewerMessage={handleViewerMessage}
      on:updateActiveRange={handleUpdateActiveRange}
      on:togglePreview={togglePreviewMode}
      on:export={exportPDF}
    />
  </div>
  <SeoJsonLd title={$t('meta.title')} />

  <AiLoadingModal
    {isAiLoading}
    {tocRanges}
  />

  <OffsetModal
    bind:showOffsetModal
    bind:offsetPreviewPageNum
    {firstTocItem}
    totalPages={pdfState.totalPages}
    on:confirm={handleOffsetConfirm}
    on:skip={handleOffsetSkip}
  />

  <HelpModal bind:showHelpModal />

  <StarRequestModal bind:show={showStarRequestModal} />
{/if}

<svelte:window on:beforeunload={handleBeforeUnload} />


<style>
  .writing-mode-vertical {
    writing-mode: vertical-rl;
  }
</style>
