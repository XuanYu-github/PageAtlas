<script lang="ts">
  import {createEventDispatcher, tick, onDestroy} from 'svelte';
  import {t} from 'svelte-i18n';
  import PixelIcon from './icons/PixelIcon.svelte';
  import {iconArrowLeft, iconArrowRight, iconChevronDown, iconGrip, iconList, iconMaximize, iconZoomIn, iconZoomOut} from './icons/index';

  import { pdfService, tocConfig } from '../stores';
  import { type PDFService, type PDFState, type TocItem } from '$lib/pdf/service';
  import { renderQueue } from '$lib/pdf/render-queue';
  import { formatPageLabel } from '$lib/pdf/page-labels';
  import type { RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

  export let pdfState: PDFState;
  export let originalPdfInstance: any = null;
  export let tocPdfInstance: any = null;
  export let tocPageCount: number = 0;
  export let mode: 'single' | 'grid' = 'single';
  export let tocRanges: {start: number; end: number; id: string}[];
  export let activeRangeIndex: number = 0;

  export let jumpToTocPage: (() => Promise<void>) | undefined = undefined;
  export let addPhysicalTocPage: boolean = false;
  export let currentTocPath: TocItem[] = [];
  export let prefetchPageNum: number = 0;
  export let previewAnchorPage: number = 0;

  const dispatch = createEventDispatcher();

  type PreviewReadMode = 'single' | 'single-continuous' | 'two-page' | 'two-page-continuous';
  type FitMode = 'actual-size' | 'fit-page' | 'fit-width' | 'fit-viewport';

  let gridPages: {pageNum: number; canvasId: string}[] = [];
  let pdfServiceInstance: PDFService | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let scrollContainer: HTMLElement;
  let canvasElement: HTMLCanvasElement;
  let spreadPrimaryCanvas: HTMLCanvasElement;
  let spreadSecondaryCanvas: HTMLCanvasElement;

  let canvasesToObserve: HTMLCanvasElement[] = [];

  let isSelecting = false;
  let selectionStartPage = 0;

  let pressTimer: number | null = null;
  let loadedFilename: string = '';

  let autoScrollSpeed = 0;
  let autoScrollFrameId: number | null = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  let lastPageId = '';
  let containerWidth = 0;
  let containerHeight = 0;

  let pageLabels: string[] | null = null;
  let lastPageLabelsInstance: any = null;
  let previewReadMode: PreviewReadMode = 'single-continuous';
  let fitMode: FitMode = 'fit-page';
  let showReadModeMenu = false;
  let showFitModeMenu = false;
  let basePageSize = { width: 0, height: 0 };
  let scrollSyncFrameId: number | null = null;
  let suppressScrollSync = false;
  let syncingFromScroll = false;
  let lastProgrammaticAnchorPage = 0;

  const STANDARD_PADDING = 40;
  const VIEWPORT_PADDING = 16;
  const SPREAD_GAP = 24;
  const previewReadModeOptions: PreviewReadMode[] = ['single', 'single-continuous', 'two-page', 'two-page-continuous'];
  const fitModeOptions: FitMode[] = ['actual-size', 'fit-page', 'fit-width', 'fit-viewport'];

  let tocVersion = 0;
  $: if (tocPdfInstance) {
    tocVersion++;
  }

  const unsubscribePdfService = pdfService.subscribe((val) => (pdfServiceInstance = val));

  function safeCancel(task: RenderTask | null | undefined) {
    if (!task) return;
    try {
      task.cancel();
    } catch (e) {
      // Ignore cancellation errors
    }
  }

  function cleanupObservers() {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    // Force the next mounted scroller to run initial anchor sync again.
    // Without this, continuous preview can reuse an old container reference
    // and incorrectly fall back to the first page.
    // @ts-ignore intentional reset for remount flow
    scrollContainer = undefined;
    lastProgrammaticAnchorPage = 0;
    suppressScrollSync = false;
    stopAutoScroll();
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  onDestroy(() => {
    unsubscribePdfService();
    cleanupObservers();
    if (scrollSyncFrameId) {
      cancelAnimationFrame(scrollSyncFrameId);
    }
  });

  $: ({filename, currentPage, scale, totalPages: stateTotalPages} = pdfState);
  $: activeTotalPages = stateTotalPages;
  $: isGridMode = mode === 'grid';
  $: isSinglePageMode = mode === 'single' && previewReadMode === 'single';
  $: isSingleContinuousMode = mode === 'single' && previewReadMode === 'single-continuous';
  $: isTwoPageMode = mode === 'single' && previewReadMode === 'two-page';
  $: isTwoPageContinuousMode = mode === 'single' && previewReadMode === 'two-page-continuous';
  $: visibleCurrentPage = isTwoPageMode || isTwoPageContinuousMode ? Math.max(1, currentPage % 2 === 0 ? currentPage - 1 : currentPage) : currentPage;
  $: spreadSecondPage = (isTwoPageMode || isTwoPageContinuousMode) && visibleCurrentPage < activeTotalPages
    ? visibleCurrentPage + 1
    : null;
  $: spreadStartPages = Array.from({length: Math.ceil(activeTotalPages / 2)}, (_, index) => index * 2 + 1);

  function getVirtualPageInfo(pageNum: number) {
    if (!tocPdfInstance || !addPhysicalTocPage) {
      return { instance: originalPdfInstance, localPageNum: pageNum };
    }

    const insertAt = $tocConfig.insertAtPage || 2;
    if (pageNum < insertAt) {
      return { instance: originalPdfInstance, localPageNum: pageNum };
    } else if (pageNum < insertAt + tocPageCount) {
      return { instance: tocPdfInstance, localPageNum: pageNum - insertAt + 1 };
    } else {
      return { instance: originalPdfInstance, localPageNum: pageNum - tocPageCount };
    }
  }

  function getPageId(pageNum: number) {
    const { instance, localPageNum } = getVirtualPageInfo(pageNum);
    if (instance === tocPdfInstance) {
      return `toc-${tocVersion}-${localPageNum}`;
    }
    return `orig-${localPageNum}`;
  }

  function normalizeTargetPage(pageNum: number): number {
    const clamped = Math.max(1, Math.min(pageNum, activeTotalPages || 1));
    if (previewReadMode === 'two-page' || previewReadMode === 'two-page-continuous') {
      return clamped % 2 === 0 ? clamped - 1 : clamped;
    }
    return clamped;
  }

  function getNavigationStep(): number {
    return previewReadMode === 'two-page' || previewReadMode === 'two-page-continuous' ? 2 : 1;
  }

  function getFitBaseScale(totalWidth: number, totalHeight: number): number {
    if (!containerWidth || !containerHeight || totalWidth <= 0 || totalHeight <= 0) {
      return 1;
    }

    if (fitMode === 'actual-size') {
      return 1;
    }

    if (fitMode === 'fit-width') {
      return Math.max((containerWidth - STANDARD_PADDING) / totalWidth, 0.1);
    }

    const padding = fitMode === 'fit-viewport' ? VIEWPORT_PADDING : STANDARD_PADDING;
    return Math.max(
      Math.min((containerWidth - padding) / totalWidth, (containerHeight - padding) / totalHeight),
      0.1,
    );
  }

  function getPreviewReadModeLabel(modeValue: PreviewReadMode): string {
    if (modeValue === 'single') return $t('viewer.read_mode_single');
    if (modeValue === 'single-continuous') return $t('viewer.read_mode_single_continuous');
    if (modeValue === 'two-page') return $t('viewer.read_mode_two_page');
    return $t('viewer.read_mode_two_page_continuous');
  }

  function getFitModeLabel(modeValue: FitMode): string {
    if (modeValue === 'actual-size') return $t('viewer.fit_actual_size');
    if (modeValue === 'fit-width') return $t('viewer.fit_width');
    if (modeValue === 'fit-viewport') return $t('viewer.fit_viewport');
    return $t('viewer.fit_page');
  }

  async function setPreviewReadMode(nextMode: PreviewReadMode) {
    previewReadMode = nextMode;
    showReadModeMenu = false;
    pdfState.currentPage = normalizeTargetPage(pdfState.currentPage || 1);
    await tick();

    if (nextMode === 'single') {
      renderCurrentPage();
      return;
    }

    if (nextMode === 'two-page') {
      renderSpreadPages();
      return;
    }

    scrollToPageAnchor(pdfState.currentPage || 1);
  }

  function setFitMode(nextMode: FitMode) {
    fitMode = nextMode;
    showFitModeMenu = false;
    pdfState.scale = 1.0;
  }

  function toggleReadModeMenu() {
    showReadModeMenu = !showReadModeMenu;
    if (showReadModeMenu) {
      showFitModeMenu = false;
    }
  }

  function toggleFitModeMenu() {
    showFitModeMenu = !showFitModeMenu;
    if (showFitModeMenu) {
      showReadModeMenu = false;
    }
  }

  function closeMenus() {
    showReadModeMenu = false;
    showFitModeMenu = false;
  }

  function updateCurrentPageFromScroll() {
    if (!scrollContainer || !(isSingleContinuousMode || isTwoPageContinuousMode)) return;

    const anchors = Array.from(scrollContainer.querySelectorAll<HTMLElement>('[data-page-anchor]'));
    if (anchors.length === 0) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetY = containerRect.top + (containerRect.height * 0.33);

    let closestPage = currentPage || 1;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const anchor of anchors) {
      const page = Number(anchor.dataset.pageAnchor);
      if (!Number.isFinite(page)) continue;

      const rect = anchor.getBoundingClientRect();
      const distance = Math.abs(rect.top - targetY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = page;
      }
    }

    const normalized = normalizeTargetPage(closestPage);
    if (normalized !== (currentPage || 1)) {
      syncingFromScroll = true;
      pdfState.currentPage = normalized;
      queueMicrotask(() => {
        syncingFromScroll = false;
      });
    }
  }

  function handleContinuousScroll() {
    if (suppressScrollSync) return;
    if (scrollSyncFrameId) {
      cancelAnimationFrame(scrollSyncFrameId);
    }

    scrollSyncFrameId = requestAnimationFrame(() => {
      scrollSyncFrameId = null;
      updateCurrentPageFromScroll();
    });
  }

  async function primeContinuousPages(pageNum: number) {
    if (!scrollContainer || !pdfServiceInstance) return;

    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const candidatePages = (previewReadMode === 'two-page-continuous'
      ? [pageNum - 2, pageNum, pageNum + 1, pageNum + 2]
      : [pageNum - 1, pageNum, pageNum + 1]
    ).filter((candidate) => candidate >= 1 && candidate <= activeTotalPages);

    for (const candidatePage of candidatePages) {
      const canvas = scrollContainer.querySelector(`canvas[data-page-num="${candidatePage}"]`) as HTMLCanvasElement | null;
      if (!canvas) continue;

      const {instance, localPageNum} = getVirtualPageInfo(candidatePage);
      if (!instance) continue;

      const measuredWidth = canvas.clientWidth
        || canvas.parentElement?.clientWidth
        || Math.floor(canvas.getBoundingClientRect().width)
        || Math.floor(canvas.parentElement?.getBoundingClientRect().width || 0);
      const canvasWidth = Math.max(measuredWidth || 0, 140);

      await pdfServiceInstance.renderPageToCanvas(instance, localPageNum, canvas, canvasWidth);
    }
  }

  function scrollToPageAnchor(pageNum: number, smooth = false) {
    if (!scrollContainer) return;

    const targetPage = normalizeTargetPage(pageNum);
    const anchor = scrollContainer.querySelector(`[data-page-anchor="${targetPage}"]`) as HTMLElement | null;
    if (anchor) {
      suppressScrollSync = true;
      lastProgrammaticAnchorPage = targetPage;
      const containerRect = scrollContainer.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const relativeTop = anchorRect.top - containerRect.top;
      const nextScrollTop =
        scrollContainer.scrollTop + relativeTop - scrollContainer.clientHeight / 2 + anchor.clientHeight / 2;

      scrollContainer.scrollTo({
        top: nextScrollTop,
        behavior: smooth ? 'smooth' : 'auto',
      });
      window.setTimeout(() => {
        suppressScrollSync = false;
      }, smooth ? 260 : 80);

      if (isSingleContinuousMode || isTwoPageContinuousMode) {
        window.setTimeout(() => {
          void primeContinuousPages(targetPage);
        }, smooth ? 40 : 0);
      }
    }
  }

  $: currentPageLabel = (originalPdfInstance && $tocConfig.pageLabelSettings.enabled) 
    ? formatPageLabel(currentPage - 1, $tocConfig.pageLabelSettings, activeTotalPages)
    : (pageLabels?.[currentPage - 1] || '');

  async function refreshPageLabels(pdfInstance: any) {
    pageLabels = null;

    if (!pdfInstance || typeof pdfInstance.getPageLabels !== 'function') return;

    try {
      const labels = await pdfInstance.getPageLabels();
      if (lastPageLabelsInstance !== pdfInstance) return;
      pageLabels = labels;
    } catch (e) {
      // Ignore getPageLabels errors and fall back to physical page numbers.
    }
  }

  $: if (originalPdfInstance && originalPdfInstance !== lastPageLabelsInstance) {
    lastPageLabelsInstance = originalPdfInstance;
    refreshPageLabels(originalPdfInstance);
  }

  async function refreshBasePageSize() {
    if (!originalPdfInstance) {
      basePageSize = {width: 0, height: 0};
      return;
    }

    try {
      const firstPage = await originalPdfInstance.getPage(1);
      const viewport = firstPage.getViewport({scale: 1.0});
      basePageSize = {width: viewport.width, height: viewport.height};
      firstPage.cleanup();
    } catch (error) {
      console.warn('Failed to inspect base page size:', error);
    }
  }

  $: if (originalPdfInstance) {
    refreshBasePageSize();
  }


  $: if (originalPdfInstance && filename && filename !== loadedFilename) {
    loadedFilename = filename;
    tick().then(() => {
      dispatch('fileloaded', {
        message: $t('msg.pdf_loaded'),
        type: 'success',
      });
    });
  }

  $: if (!originalPdfInstance) {
    lastPageId = '';
    gridPages = [];
    cleanupObservers();
  }

  async function renderPageToCanvas(pageNum: number, targetCanvas: HTMLCanvasElement, displayScale: number, cacheSuffix: string) {
    const {instance, localPageNum} = getVirtualPageInfo(pageNum);
    if (!instance) return;

    try {
      const page = await instance.getPage(localPageNum);
      const viewport = page.getViewport({ scale: displayScale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.floor(viewport.width * dpr);
      const targetH = Math.floor(viewport.height * dpr);
      const pageId = `${getPageId(pageNum)}-${cacheSuffix}`;
      const ctx = targetCanvas.getContext('2d', { alpha: false });
      if (!ctx) {
        page.cleanup();
        return;
      }

      const bitmap = await renderQueue.enqueue(pageId, instance, localPageNum, 0);
      targetCanvas.width = targetW;
      targetCanvas.height = targetH;
      targetCanvas.style.width = `${Math.floor(viewport.width)}px`;
      targetCanvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      page.cleanup();
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') console.error('Rendering error:', e);
    }
  }

  async function renderCurrentPage() {
    if (!originalPdfInstance || !currentPage || !scale || !canvasElement) return;

    const {instance, localPageNum} = getVirtualPageInfo(currentPage);
    if (!instance) return;

    const page = await instance.getPage(localPageNum);
    const viewportOrig = page.getViewport({scale: 1.0});
    const baseFitScale = getFitBaseScale(viewportOrig.width, viewportOrig.height);
    const displayScale = scale * baseFitScale;
    const pageId = `${getPageId(currentPage)}-single-${fitMode}-${Math.round(scale * 100)}`;

    const targetViewport = page.getViewport({scale: displayScale});
    if (lastPageId === pageId && canvasElement.width === Math.floor(targetViewport.width * Math.min(window.devicePixelRatio || 1, 2)) && canvasElement.height === Math.floor(targetViewport.height * Math.min(window.devicePixelRatio || 1, 2))) {
      page.cleanup();
      return;
    }

    lastPageId = pageId;
    page.cleanup();
    await renderPageToCanvas(currentPage, canvasElement, displayScale, `single-${fitMode}-${Math.round(scale * 100)}`);
  }

  async function renderSpreadPages() {
    if (!originalPdfInstance || !visibleCurrentPage || !spreadPrimaryCanvas || !scale) return;

    const firstInfo = getVirtualPageInfo(visibleCurrentPage);
    if (!firstInfo.instance) return;

    const firstPage = await firstInfo.instance.getPage(firstInfo.localPageNum);
    const firstViewport = firstPage.getViewport({scale: 1.0});

    let secondViewport = null;
    if (spreadSecondPage) {
      const secondInfo = getVirtualPageInfo(spreadSecondPage);
      if (secondInfo.instance) {
        const secondPage = await secondInfo.instance.getPage(secondInfo.localPageNum);
        secondViewport = secondPage.getViewport({scale: 1.0});
        secondPage.cleanup();
      }
    }

    const totalWidth = firstViewport.width + (secondViewport ? SPREAD_GAP + secondViewport.width : 0);
    const totalHeight = Math.max(firstViewport.height, secondViewport?.height || 0);
    const displayScale = scale * getFitBaseScale(totalWidth, totalHeight);

    firstPage.cleanup();
    await renderPageToCanvas(visibleCurrentPage, spreadPrimaryCanvas, displayScale, `spread-${fitMode}-${Math.round(scale * 100)}`);

    if (spreadSecondPage && spreadSecondaryCanvas) {
      spreadSecondaryCanvas.style.display = '';
      await renderPageToCanvas(spreadSecondPage, spreadSecondaryCanvas, displayScale, `spread-${fitMode}-${Math.round(scale * 100)}`);
    } else if (spreadSecondaryCanvas) {
      spreadSecondaryCanvas.width = 0;
      spreadSecondaryCanvas.height = 0;
      spreadSecondaryCanvas.style.display = 'none';
    }
  }

  $: if (isSinglePageMode && originalPdfInstance && currentPage && scale && containerWidth && containerHeight) {
    renderCurrentPage();
  }

  $: if (isTwoPageMode && originalPdfInstance && visibleCurrentPage && scale && containerWidth && containerHeight) {
    renderSpreadPages();
  }

  const goToNextPage = () => {
    const nextPage = normalizeTargetPage((currentPage || 1) + getNavigationStep());
    if (nextPage > (currentPage || 1) && nextPage <= activeTotalPages) {
      pdfState.currentPage = nextPage;
      if (isSingleContinuousMode || isTwoPageContinuousMode) {
        tick().then(() => scrollToPageAnchor(nextPage));
      }
    }
  };

  const goToPrevPage = () => {
    const previousPage = normalizeTargetPage((currentPage || 1) - getNavigationStep());
    if (previousPage < (currentPage || 1) && previousPage >= 1) {
      pdfState.currentPage = previousPage;
      if (isSingleContinuousMode || isTwoPageContinuousMode) {
        tick().then(() => scrollToPageAnchor(previousPage));
      }
    }
  };
  const zoomIn = () => {
    pdfState.scale = Math.min(scale + 0.15, 2.0);
  };

  const zoomOut = () => {
    pdfState.scale = Math.max(scale - 0.15, 0.5);
  };

  const resetZoom = () => {
    pdfState.scale = 1.0;
    fitMode = 'fit-page';
    showFitModeMenu = false;
  };

  $: if (prefetchPageNum > 0) {
    handleMouseHover(prefetchPageNum);
  }

  $: if (originalPdfInstance && activeTotalPages > 0) {
    if (gridPages.length !== activeTotalPages) {
      gridPages = Array.from({length: activeTotalPages}, (_, i) => ({
        pageNum: i + 1,
        canvasId: `thumb-canvas-${i + 1}`,
      }));
    }
  } else if (!originalPdfInstance && gridPages.length > 0) {
    gridPages = [];
  }

  $: continuousSinglePageWidth = basePageSize.width
    ? Math.max(220, Math.floor(basePageSize.width * scale * getFitBaseScale(basePageSize.width, basePageSize.height)))
    : 0;
  $: continuousSpreadPageWidth = basePageSize.width
    ? Math.max(180, Math.floor(basePageSize.width * scale * getFitBaseScale((basePageSize.width * 2) + SPREAD_GAP, basePageSize.height)))
    : 0;
  $: if ((isSingleContinuousMode || isTwoPageContinuousMode) && scrollContainer && previewAnchorPage > 0) {
    const normalizedPage = normalizeTargetPage(previewAnchorPage);
    if (normalizedPage !== lastProgrammaticAnchorPage) {
      tick().then(() => scrollToPageAnchor(normalizedPage, false));
    }
  }

  async function autoScrollToActiveRange() {
    if (mode !== 'grid' || !scrollContainer) return;
    const range = tocRanges[activeRangeIndex];
    if (!range) return;

    const targetPage = range.start;
    await tick();
    if (!scrollContainer) return;

    const pageEl = scrollContainer.querySelector(`[data-page-num="${targetPage}"]`) as HTMLElement;
    if (pageEl) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = pageEl.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      const targetScrollTop =
        scrollContainer.scrollTop + relativeTop - scrollContainer.clientHeight / 2 + pageEl.clientHeight / 2;

      scrollContainer.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    }
  }

  $: if (activeRangeIndex >= 0 && mode === 'grid') {
    autoScrollToActiveRange();
  }

  function scrollLoop() {
    if (autoScrollSpeed === 0 || !scrollContainer) {
      autoScrollFrameId = null;
      return;
    }
    scrollContainer.scrollTop += autoScrollSpeed;

    if (isSelecting) {
      updateSelectionFromPoint(lastMouseX, lastMouseY);
    }

    autoScrollFrameId = requestAnimationFrame(scrollLoop);
  }

  function updateSelectionFromPoint(clientX: number, clientY: number) {
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();

    const clampedX = Math.max(rect.left + 5, Math.min(rect.right - 5, clientX));
    const clampedY = Math.max(rect.top + 5, Math.min(rect.bottom - 5, clientY));

    const targetElement = document.elementFromPoint(clampedX, clampedY);
    if (!targetElement) return;

    const pageItem = targetElement.closest('[data-page-num]') as HTMLElement;
    if (pageItem && pageItem.dataset.pageNum) {
      const pageNum = parseInt(pageItem.dataset.pageNum, 10);
      if (!isNaN(pageNum)) {
        handleMouseEnter(pageNum);
      }
    }
  }

  function stopAutoScroll() {
    autoScrollSpeed = 0;
    if (autoScrollFrameId) {
      cancelAnimationFrame(autoScrollFrameId);
      autoScrollFrameId = null;
    }
  }

  function checkAutoScroll(clientY: number) {
    if (!isSelecting || !scrollContainer) {
      stopAutoScroll();
      return;
    }
    const rect = scrollContainer.getBoundingClientRect();
    const hotZoneSize = 80;

    if (clientY < rect.top + hotZoneSize) {
      autoScrollSpeed = -10;
      if (!autoScrollFrameId) autoScrollFrameId = requestAnimationFrame(scrollLoop);
    } else if (clientY > rect.bottom - hotZoneSize) {
      autoScrollSpeed = 10;
      if (!autoScrollFrameId) autoScrollFrameId = requestAnimationFrame(scrollLoop);
    } else {
      stopAutoScroll();
    }
  }

  function handleMouseHover(pageNum: number) {
    if (mode === 'grid' || !originalPdfInstance) return;
    
    // Prefetch with lower priority
    const { instance, localPageNum } = getVirtualPageInfo(pageNum);
    if (!instance) return;
    const pageId = getPageId(pageNum);
    renderQueue.enqueue(pageId, instance, localPageNum, 5);
  }

  function handleMouseDown(pageNum: number) {
    isSelecting = true;
    selectionStartPage = pageNum;
    dispatch('updateActiveRange', {start: pageNum, end: pageNum});
  }

  function handleMouseEnter(pageNum: number) {
    if (!isSelecting) return;

    const newStart = Math.min(selectionStartPage, pageNum);
    const newEnd = Math.max(selectionStartPage, pageNum);

    const currentRange = tocRanges[activeRangeIndex];
    if (currentRange && (currentRange.start !== newStart || currentRange.end !== newEnd)) {
      dispatch('updateActiveRange', {start: newStart, end: newEnd});
    }
  }

  function handleMouseUp() {
    stopAutoScroll();
    isSelecting = false;
    selectionStartPage = 0;
  }

  function handleGridMouseMove(e: MouseEvent) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (!isSelecting) return;

    checkAutoScroll(e.clientY);
    updateSelectionFromPoint(e.clientX, e.clientY);
  }

  function handleTouchStart(pageNum: number) {
    if (pressTimer) {
      clearTimeout(pressTimer);
    }
    pressTimer = window.setTimeout(() => {
      handleMouseDown(pageNum);
      pressTimer = null;
    }, 300);
  }

  function handleTouchMove(e: TouchEvent) {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    if (!isSelecting) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    if (!touch) return;

    checkAutoScroll(touch.clientY);

    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetElement) return;

    const pageItem = targetElement.closest('[data-page-num]') as HTMLElement;

    if (pageItem && pageItem.dataset.pageNum) {
      const pageNum = parseInt(pageItem.dataset.pageNum, 10);
      if (!isNaN(pageNum)) {
        handleMouseEnter(pageNum);
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (!isSelecting) return;

    checkAutoScroll(e.clientY);
    updateSelectionFromPoint(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    stopAutoScroll();
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    isSelecting = false;
    selectionStartPage = 0;
  }


  function observeViewport(node: HTMLElement) {
    scrollContainer = node;
    lastProgrammaticAnchorPage = 0;

    if (intersectionObserver) intersectionObserver.disconnect();

    intersectionObserver = new IntersectionObserver(
      async (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            const canvas = entry.target as HTMLCanvasElement;
            const pageNum = parseInt(canvas.dataset.pageNum || '0', 10);

            if (pageNum > 0 && originalPdfInstance) {
              const { instance, localPageNum } = getVirtualPageInfo(pageNum);
              if (!instance) return;

              const measuredWidth = canvas.clientWidth
                || canvas.parentElement?.clientWidth
                || Math.floor(canvas.getBoundingClientRect().width)
                || Math.floor(canvas.parentElement?.getBoundingClientRect().width || 0);
              const canvasWidth = Math.max(measuredWidth || 0, 140);

              // Direct canvas rendering is slower than bitmap reuse, but much
              // more reliable for thumbnail grids where some pages were
              // intermittently ending up blank.
              if (pdfServiceInstance?.renderPageToCanvas) {
                await pdfServiceInstance.renderPageToCanvas(instance, localPageNum, canvas, canvasWidth);
              } else {
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const page = await instance.getPage(localPageNum);
                const viewport = page.getViewport({ scale: 1.0 });
                const scale = canvasWidth / viewport.width;
                const pageId = `thumb-${getPageId(pageNum)}`;
                const bitmap = await renderQueue.enqueue(pageId, instance, localPageNum, 1);
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) {
                  page.cleanup();
                  return;
                }

                canvas.width = Math.floor(viewport.width * scale * dpr);
                canvas.height = Math.floor(viewport.height * scale * dpr);
                canvas.style.width = `${canvasWidth}px`;
                canvas.style.height = 'auto';
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                page.cleanup();
              }

              if (intersectionObserver) {
                intersectionObserver.unobserve(canvas);
              }
            }
          }
        });
      },
      {
        root: node,
        rootMargin: '300px',
      },
    );

    canvasesToObserve.forEach((canvas) => {
      if (intersectionObserver) {
        intersectionObserver.observe(canvas);
      }
    });
    canvasesToObserve = [];

    return {
      destroy() {
        if (scrollContainer === node) {
          // Reset container-bound sync state when switching view modes so the
          // next mounted continuous scroller performs its initial anchor jump.
          // @ts-ignore intentional reset for remount flow
          scrollContainer = undefined;
          lastProgrammaticAnchorPage = 0;
          suppressScrollSync = false;
        }
        if (intersectionObserver) {
          intersectionObserver.disconnect();
          intersectionObserver = null;
        }
      },
    };
  }

  function lazyRender(canvas: HTMLCanvasElement, {pageNum}: {pageNum: number}) {
    canvas.dataset.pageNum = pageNum.toString();

    if (intersectionObserver) {
      intersectionObserver.observe(canvas);
    } else {
      canvasesToObserve.push(canvas);
    }

    return {
      destroy() {
        if (intersectionObserver) {
          intersectionObserver.unobserve(canvas);
        } else {
          canvasesToObserve = canvasesToObserve.filter((c) => c !== canvas);
        }
      },
    };
  }

</script>

<svelte:window
  on:click={closeMenus}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointercancel={handlePointerUp}
  on:mousemove={handleGridMouseMove}
  on:mouseup={handleMouseUp}
  on:touchend={handlePointerUp}
  on:touchcancel={handlePointerUp}
/>

<div class="relative w-full flex-1 min-h-0 panel-paper overflow-visible">
  <div
    class="flex flex-col h-full absolute w-full inset-0 z-10 panel-paper"
    class:hidden={mode !== 'single'}
  >
    <div class="relative z-40 w-full dialog-board pixel-reading-surface overflow-visible">
      <div class="pixel-control-bar min-w-0 flex-nowrap gap-2 md:gap-3 overflow-visible">
        <div class="pixel-control-group min-w-0 flex-1 flex-nowrap gap-2">
          <span class="min-w-0 flex-1 truncate text-[13px] md:text-[15px] font-pixel-ui text-[color:var(--pa-bark)]">
            {filename || $t('viewer.no_file')}
          </span>
          <span class="shrink-0 text-[color:rgba(77,45,23,0.35)]">|</span>
          <div class="inventory-slot shrink-0 flex items-center gap-1.5 flex-nowrap min-h-12 min-w-[96px] md:min-w-[112px] justify-between px-2">
            <input
              type="number"
              min="1"
              max={activeTotalPages}
              value={visibleCurrentPage}
              on:change={(e) => {
                const val = parseInt(e.currentTarget.value, 10);
                if (!isNaN(val) && val >= 1 && val <= activeTotalPages) {
                  const targetPage = normalizeTargetPage(val);
                  pdfState.currentPage = targetPage;
                  if (isSingleContinuousMode || isTwoPageContinuousMode) {
                    tick().then(() => scrollToPageAnchor(targetPage));
                  }
                } else {
                  e.currentTarget.value = visibleCurrentPage.toString();
                }
              }}
              class="w-10 md:w-12 text-center p-0 text-[color:var(--pa-ink)] min-h-10 bg-transparent shadow-none border-0"
            />
            {#if currentPageLabel}
              <span class="farm-badge hidden xl:inline-flex text-[11px]">{currentPageLabel}</span>
            {/if}
            <span class="min-w-[40px] md:min-w-[44px] font-pixel-ui text-[color:var(--pa-bark)] text-[13px] md:text-[14px]">/ {activeTotalPages}</span>
          </div>

          {#if tocPdfInstance && jumpToTocPage}
            <button
              on:click={jumpToTocPage}
              class="btn farm-btn-secondary shrink-0 min-h-12 h-12 px-2 md:px-3 text-[11px] md:text-xs"
              title={$t('tooltip.jump_toc')}
            >
              <PixelIcon size={14} pixels={iconList} class="inline-block" />
              <span class="hidden sm:inline">ToC</span>
            </button>
          {/if}

          <div class="relative shrink-0">
            <button
              on:click|stopPropagation={toggleReadModeMenu}
              class="btn farm-btn-secondary shrink-0 min-h-12 h-12 px-2 md:px-3 text-[11px] md:text-xs"
              title={$t('viewer.read_mode_menu')}
            >
              <PixelIcon size={14} pixels={iconGrip} class="inline-block" />
              <span class="hidden lg:inline">{getPreviewReadModeLabel(previewReadMode)}</span>
              <PixelIcon size={10} pixels={iconChevronDown} class="hidden lg:inline-block" />
            </button>

            {#if showReadModeMenu}
              <div
                class="absolute right-0 top-[calc(100%+8px)] z-[70] dialog-board pixel-reading-surface min-w-[172px] p-1"
              >
                {#each previewReadModeOptions as option}
                  <button
                    type="button"
                    class={`w-full text-left px-3 py-2 text-xs font-pixel-ui ${
                      previewReadMode === option ? 'farm-btn-secondary text-[color:var(--pa-ink-inverse)]' : 'text-[color:var(--pa-bark)]'
                    }`}
                    on:click={() => setPreviewReadMode(option)}
                  >
                    {getPreviewReadModeLabel(option)}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <div class="pixel-control-group shrink-0 flex-nowrap gap-2">
          <button
            on:click={zoomOut}
            class="farm-icon-button w-12 h-12"
            title={$t('tooltip.zoom_out')}
          >
            <PixelIcon size={18} pixels={iconZoomOut} />
          </button>
          <span class="inventory-slot min-h-12 min-w-[72px] justify-center text-xs md:text-sm font-pixel-ui text-[color:var(--pa-bark)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            on:click={zoomIn}
            class="farm-icon-button w-12 h-12"
            title={$t('tooltip.zoom_in')}
          >
            <PixelIcon size={18} pixels={iconZoomIn} />
          </button>
          <div class="relative shrink-0">
            <button
              on:click|stopPropagation={toggleFitModeMenu}
              class="farm-icon-button w-12 h-12"
              title={getFitModeLabel(fitMode)}
            >
              <PixelIcon size={18} pixels={iconMaximize} />
            </button>

            {#if showFitModeMenu}
              <div
                class="absolute right-0 top-[calc(100%+8px)] z-[70] dialog-board pixel-reading-surface min-w-[164px] p-1"
              >
                {#each fitModeOptions as option}
                  <button
                    type="button"
                    class={`w-full text-left px-3 py-2 text-xs font-pixel-ui ${
                      fitMode === option ? 'farm-btn-secondary text-[color:var(--pa-ink-inverse)]' : 'text-[color:var(--pa-bark)]'
                    }`}
                    on:click={() => setFitMode(option)}
                  >
                    {getFitModeLabel(option)}
                  </button>
                {/each}
                <button
                  type="button"
                  class="w-full text-left px-3 py-2 text-xs font-pixel-ui text-[color:var(--pa-bark)]"
                  on:click={resetZoom}
                >
                  {$t('tooltip.reset')}
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <div
      class="relative z-10 flex-1 overflow-hidden panel-lake single-view-container"
      bind:clientWidth={containerWidth}
      bind:clientHeight={containerHeight}
    >
      {#if currentTocPath.length > 0}
        <div class="absolute top-4 left-4 z-30 pointer-events-none max-w-[70%] md:max-w-[60%]">
          <div
            class="dialog-board pixel-reading-surface px-4 py-3 text-xs font-pixel-ui space-y-1 rounded-none"
          >
            {#each currentTocPath as item, i}
              <div
                class="truncate flex items-center gap-2"
                style="padding-left: {i * 12}px;"
              >
                {#if i > 0}
                  <div class="w-[3px] h-[3px] bg-gray-500 shrink-0"></div>
                {/if}
                <span>{item.title}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

        <button
          on:click={goToPrevPage}
          disabled={visibleCurrentPage <= 1}
          class="absolute left-3 top-1/2 -translate-y-1/2 md:left-5 z-20 farm-icon-button viewer-nav-button pointer-events-auto w-12 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PixelIcon size={20} pixels={iconArrowLeft} />
        </button>

        {#key previewReadMode}
          {#if isSinglePageMode}
            <div class="w-full h-full overflow-auto flex farm-scroll">
              <div class="m-auto p-4 max-w-full">
                <canvas
                  class="max-w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                  bind:this={canvasElement}
                ></canvas>
              </div>
            </div>
          {:else if isTwoPageMode}
            <div class="w-full h-full overflow-auto flex farm-scroll">
              <div class="m-auto p-4 max-w-full">
                <div class="flex items-start justify-center gap-6">
                  <canvas
                    class="max-w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                    bind:this={spreadPrimaryCanvas}
                  ></canvas>
                  <canvas
                    class="max-w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                    bind:this={spreadSecondaryCanvas}
                  ></canvas>
                </div>
              </div>
            </div>
          {:else if isSingleContinuousMode}
            <div class="w-full h-full overflow-auto farm-scroll" use:observeViewport on:scroll={handleContinuousScroll}>
              <div class="flex flex-col items-center gap-6 p-4">
                {#each gridPages as page (page.pageNum)}
                  <div
                    data-page-anchor={page.pageNum}
                    class="mx-auto"
                    style={`width:${continuousSinglePageWidth || 320}px; max-width:100%;`}
                  >
                    <canvas
                      class="w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                      use:lazyRender={{pageNum: page.pageNum}}
                    ></canvas>
                  </div>
                {/each}
              </div>
            </div>
          {:else if isTwoPageContinuousMode}
            <div class="w-full h-full overflow-auto farm-scroll" use:observeViewport on:scroll={handleContinuousScroll}>
              <div class="flex flex-col items-center gap-6 p-4">
                {#each spreadStartPages as startPage (startPage)}
                  <div
                    data-page-anchor={startPage}
                    class="mx-auto flex items-start justify-center gap-6 max-w-full"
                  >
                    <div style={`width:${continuousSpreadPageWidth || 240}px; max-width:calc(50vw - 2rem);`}>
                      <canvas
                        class="w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                        use:lazyRender={{pageNum: startPage}}
                      ></canvas>
                    </div>
                    {#if startPage + 1 <= activeTotalPages}
                      <div style={`width:${continuousSpreadPageWidth || 240}px; max-width:calc(50vw - 2rem);`}>
                        <canvas
                          class="w-full block panel-paper p-2 bg-[color:var(--pa-white)]"
                          use:lazyRender={{pageNum: startPage + 1}}
                        ></canvas>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/key}

        <button
          on:click={goToNextPage}
          disabled={visibleCurrentPage >= activeTotalPages}
          class="absolute right-3 top-1/2 -translate-y-1/2 md:right-5 z-20 farm-icon-button viewer-nav-button pointer-events-auto w-12 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PixelIcon size={20} pixels={iconArrowRight} />
        </button>
      </div>
  </div>

  <div
    class="absolute inset-0 z-0 panel-lake overflow-auto"
    class:hidden={mode !== 'grid'}
    use:observeViewport
  >
    <div
      class="grid grid-cols-2 gap-3 p-3 select-none md:grid-cols-3 md:gap-4 2xl:grid-cols-4 2xl:gap-5 farm-scroll"
      class:cursor-grabbing={isSelecting}
      on:touchmove|nonpassive={handleTouchMove}
      on:touchend={handlePointerUp}
      on:touchcancel={handlePointerUp}
      on:contextmenu|preventDefault
      role="grid"
      tabindex="0"
    >
      {#each gridPages as page (page.pageNum)}
        {@const rangeIndex = tocRanges.findIndex((r) => page.pageNum >= r.start && page.pageNum <= r.end)}
        {@const isSelected = rangeIndex !== -1}
        {@const isActive = rangeIndex === activeRangeIndex}
        {@const isStart = tocRanges.some((r) => r.start === page.pageNum)}
        {@const isEnd = tocRanges.some((r) => r.end === page.pageNum)}

        <div
          data-page-num={page.pageNum}
          class="relative overflow-hidden cursor-pointer inventory-card transition-all duration-150 transform"
          class:shadow-[3px_3px_0px]={isSelected}
          class:scale-[1.02]={isSelected}
          class:!bg-[linear-gradient(180deg,rgba(255,255,255,0.32),rgba(255,255,255,0.08)),linear-gradient(180deg,#fff1cf,#efd5a2)]={isSelected}
          style="-webkit-touch-callout: none;"
          on:mousedown={() => handleMouseDown(page.pageNum)}
          on:touchstart={() => handleTouchStart(page.pageNum)}
          on:mouseenter={() => handleMouseEnter(page.pageNum)}
          on:dragstart|preventDefault
          role="gridcell"
          tabindex="0"
        >
          {#if isStart}
            <span
              class="absolute -top-1.5 -left-1.5 z-10 farm-badge {isActive ? '!bg-[linear-gradient(180deg,#d9eef8,#74b6d4)]' : '!bg-[linear-gradient(180deg,#f7eed9,#e1cf9c)]'}"
            >
              {$t('label.start')}
            </span>
          {/if}

          {#if isEnd}
            <span
              class="absolute -bottom-1.5 -right-1.5 z-10 farm-badge {isActive ? '!bg-[linear-gradient(180deg,#d9eef8,#74b6d4)]' : '!bg-[linear-gradient(180deg,#f7eed9,#e1cf9c)]'}"
            >
              {$t('label.end')}
            </span>
          {/if}

          <canvas
            id={page.canvasId}
            class:cursor-grabbing={isSelecting}
            class="w-full border-b border-[color:var(--pa-bark)] bg-white h-[calc(100%-30px)]"
            use:lazyRender={{pageNum: page.pageNum}}
          ></canvas>

          <div class="absolute left-2 bottom-9 w-3 h-3 bg-[color:var(--pa-wood-dark)] border-2 border-[color:var(--pa-bark)]"></div>
          <div class="absolute right-2 bottom-9 w-3 h-3 bg-[color:var(--pa-wood-dark)] border-2 border-[color:var(--pa-bark)]"></div>

          <div class="text-center text-xs p-2 bg-[color:var(--pa-paper)] font-pixel-ui border-t-[4px] border-[color:var(--pa-bark)] tracking-[0.18em]">
            {page.pageNum}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
