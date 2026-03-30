<script lang="ts">
  import {onDestroy, onMount, tick} from 'svelte';
  import {t} from 'svelte-i18n';
  import rough from 'roughjs';
  import GraphNode from './GraphNode.svelte';
  import PixelIcon from './icons/PixelIcon.svelte';
  import {iconBook, iconBrain, iconDownload, iconMaximize, iconMinimize, iconRefresh, iconSparkle} from './icons/index';
  import {CARD_W, CARD_H, getRandomPaperColor, computeHierarchicalLayout, getClosestPoints} from '$lib/utils/graph';

  import type {TocItem} from '$lib/pdf/service';
  import type {GraphEdgeData, KnowledgeGraphNode} from '$lib/utils/graph';

  type ApiConfig = {
    apiKey: string;
    provider?: string;
    doubaoEndpointIdText?: string;
    openaiBaseUrl?: string;
    openaiModelText?: string;
  };
  type GraphData = {nodes: KnowledgeGraphNode[]; edges: GraphEdgeData[]};
  type GenerateBoardResponse = GraphData;
  type RoughSvgRenderer = ReturnType<typeof rough.svg>;
  type SvgParent = SVGSVGElement | SVGGElement;

  export let items: TocItem[] = [];
  export let apiConfig: ApiConfig = {apiKey: ''};

  export let title = 'Untitled Book';

  export let onJumpToPage: (pageNumber: number) => void = () => {};

  let graphData: GraphData = {nodes: [], edges: []};

  $: {
    if (items) {
      graphData = {nodes: [], edges: []};
      tick().then(drawWall);
    }
  }

  let isLoading = false;
  let isFullscreen = false;
  let isDesktopShell = false;
  let activeNodeId: string | null = null;

  let svg: SVGSVGElement | null = null;
  let rc: RoughSvgRenderer | null = null;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let viewportElement: HTMLDivElement | null = null;
  let contentWrapper: HTMLDivElement | null = null;

  let canvasWidth = 400;
  let canvasHeight = 400;

  let scale = 1;
  let viewX = 0;
  let viewY = 0;
  let isPanning = false;
  let startPanMouse = {x: 0, y: 0};
  let startPanView = {x: viewX, y: viewY};
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;
  const DESKTOP_FULLSCREEN_TOP_OFFSET = 30;

  let dragTarget: KnowledgeGraphNode | null = null;
  let initialMouse = {x: 0, y: 0};
  let initialNodePos = {x: 0, y: 0};
  let isDragging = false;
  let hasMovedDuringDrag = false;

  const ACTIVE_COLOR = '#60a5fa';

  onMount(() => {
    isDesktopShell = '__TAURI_INTERNALS__' in window;
  });

  onDestroy(() => {
    if (typeof window !== 'undefined' && isFullscreen) {
      window.dispatchEvent(new CustomEvent('pageatlas:knowledge-board-fullscreen', {detail: {active: false}}));
    }
  });

  const ROUGH_OPTS = {roughness: 2.5, bowing: 1.5, stroke: '#2d3436', strokeWidth: 1.5};
  const LINE_DIM = {roughness: 2, bowing: 1, stroke: '#e2e8f0', strokeWidth: 1};
  const LINE_ACTIVE = {roughness: 1, bowing: 1, stroke: ACTIVE_COLOR, strokeWidth: 2.5};

  async function handleGenerateGraph() {
    if (items.length === 0) return;
    isLoading = true;
    activeNodeId = null;

    const simplifiedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      page: item.to || null,
    }));

    try {
      const {generateKnowledgeBoardInBrowser} = await import('$lib/client/ai');

      const data = await generateKnowledgeBoardInBrowser({
        tocItems: simplifiedItems,
        config: {
          apiKey: apiConfig.apiKey,
          provider: apiConfig.provider,
          doubaoEndpointIdText: apiConfig.doubaoEndpointIdText,
          openaiBaseUrl: apiConfig.openaiBaseUrl,
          openaiModelText: apiConfig.openaiModelText,
        },
      }) as GenerateBoardResponse;

      let nodes: KnowledgeGraphNode[] = data.nodes.map((node) => ({
        ...node,
        bgColor: node.isInferred ? '#f8fafc' : getRandomPaperColor(),
        x: 0,
        y: 0,
        page: node.page || null,
      }));
      const edges: GraphEdgeData[] = data.edges || [];

      nodes = computeHierarchicalLayout(nodes, edges, canvasWidth);
      graphData = {nodes, edges};

      await tick();
      centerContent();
      updateCanvasSize();
      drawWall();
    } catch (error) {
      console.error(error);
      alert($t('knowledge_board.error_failed'));
    } finally {
      isLoading = false;
    }
  }

  function updateCanvasSize() {
    if (graphData.nodes.length === 0) return;

    const minX = Math.min(...graphData.nodes.map((node) => node.x));
    let maxX = Math.max(...graphData.nodes.map((node) => node.x));
    const minY = Math.min(...graphData.nodes.map((node) => node.y));
    let maxY = Math.max(...graphData.nodes.map((node) => node.y));

    let shifted = false;

    if (minX < 50) {
      const offsetX = 50 - minX;
      graphData.nodes.forEach((node) => (node.x += offsetX));
      viewX -= offsetX * scale;
      shifted = true;
    }

    if (minY < 50) {
      const offsetY = 50 - minY;
      graphData.nodes.forEach((node) => (node.y += offsetY));
      viewY -= offsetY * scale;
      shifted = true;
    }

    if (shifted) {
      maxX = Math.max(...graphData.nodes.map((node) => node.x));
      maxY = Math.max(...graphData.nodes.map((node) => node.y));
      graphData.nodes = graphData.nodes;
      requestAnimationFrame(drawWall);
    }

    const containerWidth = isFullscreen ? viewportWidth || window.innerWidth : viewportWidth || 400;
    const containerHeight = isFullscreen ? viewportHeight || window.innerHeight : viewportHeight || 400;

    canvasWidth = Math.max(maxX + CARD_W + 200, containerWidth);
    canvasHeight = Math.max(maxY + CARD_H + 200, containerHeight);
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pageatlas:knowledge-board-fullscreen', {detail: {active: isFullscreen}}));
    }
    tick().then(() => {
      centerContent();
      updateCanvasSize();
      drawWall();
    });
  }

  function handleContainerMouseDown(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const isBackground =
      event.target === event.currentTarget ||
      target?.classList.contains('bg-grid-pattern') ||
      event.target === contentWrapper;

    if (event.button === 1 || (event.button === 0 && isBackground)) {
      isPanning = true;
      startPanMouse = {x: event.clientX, y: event.clientY};
      startPanView = {x: viewX, y: viewY};
      activeNodeId = null;
      drawWall();
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();

    if (event.ctrlKey) {
      if (!viewportElement) return;

      const rect = viewportElement.getBoundingClientRect();
      const xs = (event.clientX - rect.left - viewX) / scale;
      const ys = (event.clientY - rect.top - viewY) / scale;

      const delta = -event.deltaY;
      const factor = delta > 0 ? 1.05 : 0.95;
      let newScale = scale * factor;

      if (newScale < MIN_SCALE) newScale = MIN_SCALE;
      if (newScale > MAX_SCALE) newScale = MAX_SCALE;

      viewX = event.clientX - rect.left - xs * newScale;
      viewY = event.clientY - rect.top - ys * newScale;
      scale = newScale;
    } else {
      viewX -= event.deltaX;
      viewY -= event.deltaY;
    }
  }

  function handleNodeMouseDown(event: MouseEvent, node: KnowledgeGraphNode) {
    event.stopPropagation();

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button')) return;

    activeNodeId = node.id;
    drawWall();

    isDragging = true;
    dragTarget = node;
    hasMovedDuringDrag = false;
    initialMouse = {x: event.clientX, y: event.clientY};
    initialNodePos = {x: node.x, y: node.y};
  }

  function handleWindowMouseMove(event: MouseEvent) {
    if (isPanning) {
      const dx = event.clientX - startPanMouse.x;
      const dy = event.clientY - startPanMouse.y;
      viewX = startPanView.x + dx;
      viewY = startPanView.y + dy;
      return;
    }

    if (!isDragging || !dragTarget) return;

    const dx = (event.clientX - initialMouse.x) / scale;
    const dy = (event.clientY - initialMouse.y) / scale;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasMovedDuringDrag = true;
    }

    dragTarget.x = initialNodePos.x + dx;
    dragTarget.y = initialNodePos.y + dy;

    graphData.nodes = graphData.nodes;

    requestAnimationFrame(drawWall);
  }

  function handleWindowMouseUp() {
    isPanning = false;
    if (isDragging) {
      isDragging = false;
      dragTarget = null;
      updateCanvasSize();
    }
  }

  function handleNodeClick(node: KnowledgeGraphNode) {
    if (!hasMovedDuringDrag && node.page && onJumpToPage) {
      onJumpToPage(node.page);
    }
  }

  function drawWall() {
    if (!svg) return;
    svg.innerHTML = '';
    if (!graphData.nodes.length) return;

    const renderer = rough.svg(svg);
    rc = renderer;

    const inactiveGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const activeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const pinGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    svg.appendChild(inactiveGroup);
    svg.appendChild(activeGroup);
    svg.appendChild(nodeGroup);
    svg.appendChild(pinGroup);

    const pinsToDraw = new Set<string>();
    const nodesWithPins = new Set<string>();
    const edgesToDraw: Array<{
      edge: GraphEdgeData;
      src: KnowledgeGraphNode;
      tgt: KnowledgeGraphNode;
      idx: number;
      isActive: boolean;
    }> = [];

    graphData.edges.forEach((edge, idx) => {
      const src = graphData.nodes.find((node) => node.id === edge.source);
      const tgt = graphData.nodes.find((node) => node.id === edge.target);
      if (!src || !tgt) return;

      edgesToDraw.push({
        edge,
        src,
        tgt,
        idx,
        isActive: !!activeNodeId && (edge.source === activeNodeId || edge.target === activeNodeId),
      });
    });

    edgesToDraw.forEach(({edge, src, tgt, idx, isActive}) => {
      const parentGroup = isActive ? activeGroup : inactiveGroup;
      const options = isActive ? LINE_ACTIVE : LINE_DIM;

      const {start, end} = getClosestPoints(src, tgt);
      const x1 = start.x;
      const y1 = start.y;
      const x2 = end.x;
      const y2 = end.y;

      pinsToDraw.add(`${x1},${y1}`);
      pinsToDraw.add(`${x2},${y2}`);
      nodesWithPins.add(src.id);
      nodesWithPins.add(tgt.id);

      const distY = Math.abs(y2 - y1);
      const distX = Math.abs(x2 - x1);
      const gravity = 10 + distY * 0.15;
      const curveDir = idx % 2 === 0 ? 1 : -1;
      const swing = (10 + distX * 0.05) * curveDir;

      const midX = (x1 + x2) / 2 + swing;
      const midY = (y1 + y2) / 2 + gravity;

      parentGroup.appendChild(
        renderer.curve(
          [
            [x1, y1],
            [midX, midY],
            [x2, y2],
          ],
          options,
        ),
      );

      drawArrowHead(parentGroup, midX, midY, x2, y2, isActive ? ACTIVE_COLOR : '#e2e8f0', renderer);

      if (isActive) {
        const labelX = (x1 + x2) / 2 + swing / 2;
        const labelY = midY;
        drawEdgeLabel(parentGroup, edge.label || '', labelX, labelY);
      }
    });

    graphData.nodes.forEach((node) => {
      const fillStyle = node.isInferred ? 'zigzag' : 'solid';
      const strokeStyle = node.isInferred ? '#94a3b8' : '#2d3436';

      if (!nodesWithPins.has(node.id)) {
        pinsToDraw.add(`${node.x + CARD_W / 2},${node.y + 4}`);
      }

      nodeGroup.appendChild(
        renderer.rectangle(node.x, node.y, CARD_W, CARD_H, {
          ...ROUGH_OPTS,
          fill: node.bgColor,
          fillStyle,
          stroke: strokeStyle,
          fillWeight: 1,
          strokeWidth: node.isInferred ? 1 : 1.5,
        }),
      );
    });

    pinsToDraw.forEach((coordStr) => {
      const [px, py] = coordStr.split(',').map(Number);
      drawPin(pinGroup, px, py, renderer);
    });
  }

  function centerContent() {
    if (graphData.nodes.length === 0) return;

    const contentMinX = Math.min(...graphData.nodes.map((node) => node.x));
    const contentMaxX = Math.max(...graphData.nodes.map((node) => node.x)) + CARD_W;
    const contentMinY = Math.min(...graphData.nodes.map((node) => node.y));
    const contentMaxY = Math.max(...graphData.nodes.map((node) => node.y)) + CARD_H;

    const contentWidth = contentMaxX - contentMinX;
    const contentHeight = contentMaxY - contentMinY;

    const containerWidth = isFullscreen ? viewportWidth || window.innerWidth : viewportWidth || 400;
    const containerHeight = isFullscreen ? viewportHeight || window.innerHeight : viewportHeight || 400;

    scale = 1;
    viewX = (containerWidth - contentWidth) / 2 - contentMinX;
    viewY = (containerHeight - contentHeight) / 2 - contentMinY;

    if (Number.isNaN(viewX)) viewX = 0;
    if (Number.isNaN(viewY)) viewY = 0;

    graphData.nodes = graphData.nodes;
  }

  function drawArrowHead(
    parent: SvgParent,
    prevX: number,
    prevY: number,
    tipX: number,
    tipY: number,
    color: string,
    rcInst: RoughSvgRenderer
  ) {
    const angle = Math.atan2(tipY - prevY, tipX - prevX);
    const arrowLen = 14;
    const arrowWid = 0.5;
    const xA = tipX - arrowLen * Math.cos(angle - arrowWid);
    const yA = tipY - arrowLen * Math.sin(angle - arrowWid);
    const xB = tipX - arrowLen * Math.cos(angle + arrowWid);
    const yB = tipY - arrowLen * Math.sin(angle + arrowWid);

    parent.appendChild(
      rcInst.polygon(
        [
          [tipX, tipY],
          [xA, yA],
          [xB, yB],
        ],
        {
          fill: color,
          stroke: 'none',
          fillStyle: 'solid',
          roughness: 0.5,
        },
      ),
    );
  }

  function drawEdgeLabel(parent: SvgParent, text: string, x: number, y: number) {
    if (!text) return;

    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.setAttribute('x', String(x));
    textElement.setAttribute('y', String(y + 5));
    textElement.setAttribute('text-anchor', 'middle');
    textElement.setAttribute('font-family', 'HuiwenMincho, serif');
    textElement.setAttribute('font-size', '14');
    textElement.setAttribute('fill', ACTIVE_COLOR);
    textElement.setAttribute('font-weight', 'bold');
    textElement.setAttribute('transform', 'translate(-15, -15)');
    textElement.textContent = text;
    parent.appendChild(textElement);
  }

  function drawPin(parent: SvgParent, x: number, y: number, rcInst: RoughSvgRenderer) {
    parent.appendChild(rcInst.circle(x, y, 10, {fill: ACTIVE_COLOR, fillStyle: 'solid', stroke: 'none'}));
  }

  function handleExportGraph() {
    if (graphData.nodes.length === 0) return;

    const PADDING = 60;
    const minX = Math.min(...graphData.nodes.map((node) => node.x));
    const maxX = Math.max(...graphData.nodes.map((node) => node.x));
    const minY = Math.min(...graphData.nodes.map((node) => node.y));
    const maxY = Math.max(...graphData.nodes.map((node) => node.y));

    const width = maxX - minX + CARD_W + PADDING * 2;
    const height = maxY - minY + CARD_H + PADDING * 2;
    const viewBox = `${minX - PADDING} ${minY - PADDING} ${width} ${height}`;

    const svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElem.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgElem.setAttribute('viewBox', viewBox);
    svgElem.setAttribute('width', String(width));
    svgElem.setAttribute('height', String(height));

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(minX - PADDING));
    bg.setAttribute('y', String(minY - PADDING));
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#fdfbf7');
    svgElem.appendChild(bg);

    const rcExport = rough.svg(svgElem);

    const pinsToDraw = new Set<string>();
    const nodesWithPins = new Set<string>();

    graphData.edges.forEach((edge, idx) => {
      const src = graphData.nodes.find((node) => node.id === edge.source);
      const tgt = graphData.nodes.find((node) => node.id === edge.target);
      if (!src || !tgt) return;

      const {start, end} = getClosestPoints(src, tgt);
      const x1 = start.x;
      const y1 = start.y;
      const x2 = end.x;
      const y2 = end.y;

      pinsToDraw.add(`${x1},${y1}`);
      pinsToDraw.add(`${x2},${y2}`);
      nodesWithPins.add(src.id);
      nodesWithPins.add(tgt.id);

      const distY = Math.abs(y2 - y1);
      const distX = Math.abs(x2 - x1);
      const gravity = 10 + distY * 0.15;
      const curveDir = idx % 2 === 0 ? 1 : -1;
      const swing = (10 + distX * 0.05) * curveDir;

      const midX = (x1 + x2) / 2 + swing;
      const midY = (y1 + y2) / 2 + gravity;

      svgElem.appendChild(
        rcExport.curve(
          [
            [x1, y1],
            [midX, midY],
            [x2, y2],
          ],
          LINE_DIM,
        ),
      );

      drawArrowHead(svgElem, midX, midY, x2, y2, '#e2e8f0', rcExport);

      const labelX = (x1 + x2) / 2 + swing / 2;
      const labelY = midY;
      drawEdgeLabel(svgElem, edge.label || '', labelX, labelY);
    });

    graphData.nodes.forEach((node) => {
      const fillStyle = node.isInferred ? 'zigzag' : 'solid';
      const strokeStyle = node.isInferred ? '#94a3b8' : '#2d3436';

      if (!nodesWithPins.has(node.id)) {
        pinsToDraw.add(`${node.x + CARD_W / 2},${node.y + 4}`);
      }

      svgElem.appendChild(
        rcExport.rectangle(node.x, node.y, CARD_W, CARD_H, {
          ...ROUGH_OPTS,
          fill: node.bgColor,
          fillStyle,
          stroke: strokeStyle,
          fillWeight: 1,
          strokeWidth: node.isInferred ? 1 : 1.5,
        }),
      );

      const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      foreignObject.setAttribute('x', String(node.x));
      foreignObject.setAttribute('y', String(node.y));
      foreignObject.setAttribute('width', String(CARD_W));
      foreignObject.setAttribute('height', String(CARD_H));

      const div = document.createElement('div');
      div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.style.padding = '12px';
      div.style.boxSizing = 'border-box';
      div.style.fontFamily = 'HuiwenMincho, serif';
      div.style.fontSize = '18px';
      div.style.fontWeight = 'bold';
      div.style.color = '#9ca3af';
      div.style.textAlign = 'center';
      div.style.lineHeight = '1.25rem';
      div.style.wordBreak = 'break-word';
      div.innerText = node.title || '';

      foreignObject.appendChild(div);
      svgElem.appendChild(foreignObject);
    });

    pinsToDraw.forEach((coordStr) => {
      const [px, py] = coordStr.split(',').map(Number);
      drawPin(svgElem, px, py, rcExport);
    });

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElem);

    const blob = new Blob([source], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title}-knowledge-board.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
</script>

<svelte:window
  on:mousemove={handleWindowMouseMove}
  on:mouseup={handleWindowMouseUp}
/>

<div
  class="panel-paper flex flex-col overflow-hidden mx-auto h-full
{isFullscreen
  ? isDesktopShell
    ? ` fixed left-0 right-0 bottom-0 top-[${DESKTOP_FULLSCREEN_TOP_OFFSET}px] z-[9999] w-screen h-[calc(100vh-${DESKTOP_FULLSCREEN_TOP_OFFSET}px)] rounded-none`
    : ' fixed inset-0 z-[9999] w-screen h-screen rounded-none'
  : ' relative '}"
>
  <div class="absolute top-4 left-4 z-50 pointer-events-none select-none">
    {#if isFullscreen}
      <div class="dialog-board pixel-reading-surface pixel-overlay-bar text-[color:var(--pa-ink-soft)] opacity-95">
        <PixelIcon size={24} pixels={iconBook} />
        <span class="font-pixel-ui text-[16px] md:text-[18px] tracking-wide">{title}</span>
      </div>
    {:else}
      <div class="dialog-board pixel-reading-surface pixel-overlay-bar z-50 text-[color:var(--pa-ink-soft)] opacity-95">
        <PixelIcon size={20} pixels={iconBrain} />
        <span class="font-pixel-ui text-[16px] md:text-[18px]">{$t('knowledge_board.title')}</span>

        <span
          title={$t('knowledge_board.beta')}
          class="farm-badge hover:cursor-help ml-2 pointer-events-auto"
        >
          {$t('knowledge_board.beta_badge')}
        </span>
      </div>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <div
    bind:clientWidth={viewportWidth}
    bind:clientHeight={viewportHeight}
    bind:this={viewportElement}
    on:mousedown={handleContainerMouseDown}
    on:wheel={handleWheel}
    role="application"
    tabindex="0"
    aria-label={$t('knowledge_board.title')}
      class="flex-1 overflow-hidden relative w-full h-full panel-paper cursor-grab active:cursor-grabbing no-scrollbar block select-none"
  >
    <div class="absolute inset-0 z-0 bg-grid-pattern pointer-events-none"></div>

    <div
      bind:this={contentWrapper}
      class="origin-top-left absolute top-0 left-0 z-10"
      style="width: {canvasWidth}px; height: {canvasHeight}px; transform: translate({viewX}px, {viewY}px) scale({scale});"
    >
      <svg
        bind:this={svg}
        width={canvasWidth}
        height={canvasHeight}
        class="absolute inset-0 pointer-events-none z-0"
      ></svg>

      <div class="absolute inset-0 z-10 pointer-events-none">
        {#each graphData.nodes as node (node.id)}
          <GraphNode
            {node}
            {activeNodeId}
            isDragTarget={!!dragTarget && dragTarget.id === node.id}
            on:mousedown={(e) => handleNodeMouseDown(e, node)}
            on:click={() => handleNodeClick(node)}
          />
        {/each}
      </div>
    </div>
  </div>

  {#if items.length === 0}
    <div
      class="absolute inset-0 flex flex-col items-center justify-center text-[color:var(--pa-ink-soft)] font-pixel-ui opacity-80 pointer-events-none z-0"
    >
      <PixelIcon size={54} pixels={iconRefresh} class="mb-6" />
      <span class="text-3xl text-center">{$t('knowledge_board.msg_generate_toc')}</span>
    </div>
  {:else if !isLoading && items.length > 0 && graphData.nodes.length === 0}
    <div
      class="absolute max-w-[80%] mx-auto text-center inset-0 flex flex-col items-center justify-center text-[color:var(--pa-ink-soft)] font-pixel-ui opacity-80 pointer-events-none z-0"
    >
      <PixelIcon size={54} pixels={iconSparkle} class="mb-6" />
      <span class="text-3xl">{$t('knowledge_board.msg_investigate')}</span>
    </div>
  {:else if isLoading}
    <div
      class="absolute inset-0 max-w-[80%] mx-auto text-center flex flex-col items-center justify-center text-[color:var(--pa-ink-soft)] font-pixel-ui opacity-80 pointer-events-none z-0"
    >
      <span class="text-3xl animate-bounce">{$t('knowledge_board.msg_generating')}</span>
    </div>
  {/if}

  {#if isFullscreen}
    <div
      class="absolute bottom-4 left-4 text-2xl text-[color:var(--pa-ink-soft)] pointer-events-none z-30 opacity-95"
    >
      <div class="dialog-board pixel-reading-surface pixel-overlay-bar">
        <PixelIcon size={20} pixels={iconBrain} />
        <span class="font-pixel-ui text-[16px] md:text-[18px]">{$t('knowledge_board.title')}</span>

        <span
          title={$t('knowledge_board.beta')}
          class="farm-badge hover:cursor-help ml-2 pointer-events-auto"
        >
          {$t('knowledge_board.beta_badge')}
        </span>
      </div>
    </div>
  {/if}

  {#if items.length > 0}
    <div class="absolute bottom-5 right-20 z-50 flex gap-2">
        <button
          on:click={handleGenerateGraph}
          disabled={isLoading || items.length === 0}
          class="btn farm-btn-water text-base disabled:opacity-50 min-w-[10rem]"
        >
        {#if isLoading}
          <div class="pixel-spinner"></div>
          <span>{$t('knowledge_board.btn_connecting')}</span>
        {:else}
          <PixelIcon size={18} pixels={iconSparkle} />
          <span>{$t('knowledge_board.btn_investigate')}</span>
        {/if}
      </button>

      {#if graphData.nodes.length > 0}
        <button
          on:click={handleExportGraph}
          class="farm-icon-button w-12 h-12"
          title={$t('knowledge_board.export_graph', {default: 'Export SVG'})}
        >
          <PixelIcon size={20} pixels={iconDownload} />
        </button>
      {/if}
    </div>
  {/if}

    <div class="absolute bottom-4 right-4 z-50 flex items-center gap-2">
    <button
      on:click={toggleFullscreen}
      class="farm-icon-button w-12 h-12"
    >
      {#if isFullscreen}
        <PixelIcon size={22} pixels={iconMinimize} />
      {:else}
        <PixelIcon size={22} pixels={iconMaximize} />
      {/if}
    </button>
  </div>
</div>

<style>
  .bg-grid-pattern {
    background:
      repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0 12px, rgba(255,255,255,0.015) 12px 24px),
      linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  }

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
