<script lang="ts">
  import {tick} from 'svelte';
  import {t} from 'svelte-i18n';
  import rough from 'roughjs';
  import GraphNode from './GraphNode.svelte';
  import {
    Sparkles,
    Loader2,
    RefreshCw,
    Maximize2,
    Minimize2,
    BrainCircuit,
    BookOpen,
    EyeOff,
    Download,
  } from 'lucide-svelte';
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
  export let onHide: () => void = () => {};

  let graphData: GraphData = {nodes: [], edges: []};

  $: {
    if (items) {
      graphData = {nodes: [], edges: []};
      tick().then(drawWall);
    }
  }

  let isLoading = false;
  let isFullscreen = false;
  let activeNodeId: string | null = null;

  let svg: SVGSVGElement | null = null;
  let rc: RoughSvgRenderer | null = null;
  let viewportWidth = 0;
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

  let dragTarget: KnowledgeGraphNode | null = null;
  let initialMouse = {x: 0, y: 0};
  let initialNodePos = {x: 0, y: 0};
  let isDragging = false;
  let hasMovedDuringDrag = false;

  const ACTIVE_COLOR = '#60a5fa';

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

    canvasWidth = Math.max(maxX + CARD_W + 200, isFullscreen ? window.innerWidth : 400);
    canvasHeight = Math.max(maxY + CARD_H + 200, isFullscreen ? window.innerHeight : 400);
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
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

    const containerWidth = isFullscreen ? window.innerWidth : viewportWidth || 400;
    const containerHeight = isFullscreen ? window.innerHeight : 400;

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
  class="bg-[#f0f0f0] flex flex-col overflow-hidden mx-auto
{isFullscreen ? ' fixed inset-0 z-[9999] w-screen h-screen rounded-none' : ' relative h-full rounded-xl '}"
>
  <div class="absolute top-4 left-4 z-50 pointer-events-none select-none">
    {#if isFullscreen}
      <div class="flex gap-2 text-gray-500 opacity-80">
        <BookOpen size={32} />
        <span class="font-serif text-xl tracking-wide">{title}</span>
      </div>
    {:else}
      <div class="flex items-center gap-2 text-lg z-50 md:text-2xl font-['HuiwenMincho'] text-gray-400 opacity-60">
        <BrainCircuit size={28} />
        <span>{$t('knowledge_board.title')}</span>

        <span
          title={$t('knowledge_board.beta')}
          class="hover:cursor-help ml-2 px-1 py-0 text-xs bg-yellow-300 text-yellow-900 font-bold rounded-full border-2 border-yellow-900 pointer-events-auto"
        >
          BETA
        </span>
      </div>
    {/if}
  </div>

  {#if !isFullscreen}
    <div class="absolute top-4 right-2 z-50">
      <button
        on:click={onHide}
        class="p-1 backdrop-blur-sm rounded-full transition-transform text-gray-400 hover:scale-110"
        title={$t('knowledge_board.hide_graph', {default: 'Hide Graph'})}
      >
        <EyeOff size={22} />
      </button>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <div
    bind:clientWidth={viewportWidth}
    bind:this={viewportElement}
    on:mousedown={handleContainerMouseDown}
    on:wheel={handleWheel}
    role="application"
    tabindex="0"
    aria-label={$t('knowledge_board.title')}
    class="flex-1 overflow-hidden relative w-full h-full bg-[#f0f0f0] cursor-grab active:cursor-grabbing no-scrollbar block select-none"
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
      class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 font-['HuiwenMincho'] opacity-50 pointer-events-none z-0"
    >
      <RefreshCw
        size={64}
        class="mb-6"
      />
      <span class="text-3xl text-center">{$t('knowledge_board.msg_generate_toc')}</span>
    </div>
  {:else if !isLoading && items.length > 0 && graphData.nodes.length === 0}
    <div
      class="absolute max-w-[80%] mx-auto text-center inset-0 flex flex-col items-center justify-center text-gray-400 font-['HuiwenMincho'] opacity-50 pointer-events-none z-0"
    >
      <Sparkles
        size={64}
        class="mb-6"
      />
      <span class="text-3xl">{$t('knowledge_board.msg_investigate')}</span>
    </div>
  {:else if isLoading}
    <div
      class="absolute inset-0 max-w-[80%] mx-auto text-center flex flex-col items-center justify-center text-gray-400 font-['HuiwenMincho'] opacity-50 pointer-events-none z-0"
    >
      <span class="text-3xl animate-bounce">{$t('knowledge_board.msg_generating')}</span>
    </div>
  {/if}

  {#if isFullscreen}
    <div
      class="absolute bottom-4 left-4 font-['HuiwenMincho'] text-2xl text-gray-400 pointer-events-none z-30 opacity-60"
    >
      <div class="flex items-center gap-2">
        <BrainCircuit size={28} />
        <span>{$t('knowledge_board.title')}</span>

        <span
          title={$t('knowledge_board.beta')}
          class="hover:cursor-help ml-2 px-1 py-0 text-xs bg-yellow-300 text-yellow-900 font-bold rounded-full border-2 border-yellow-900 pointer-events-auto"
        >
          BETA
        </span>
      </div>
    </div>
  {/if}

  {#if items.length > 0}
    <div class="absolute bottom-5 right-20 z-50 flex gap-2">
      <button
        on:click={handleGenerateGraph}
        disabled={isLoading || items.length === 0}
        class="flex items-center gap-2 text-white px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-400 to-cyan-400 disabled:opacity-50 transition-all active:scale-95 border-2 border-transparent font-['HuiwenMincho'] text-xl shadow-lg"
      >
        {#if isLoading}
          <Loader2
            class="animate-spin"
            size={20}
          />
          <span>{$t('knowledge_board.btn_connecting')}</span>
        {:else}
          <Sparkles size={20} />
          <span>{$t('knowledge_board.btn_investigate')}</span>
        {/if}
      </button>

      {#if graphData.nodes.length > 0}
        <button
          on:click={handleExportGraph}
          class="px-3 active:scale-95 rounded-lg border-2 border-transparent transition-all text-white bg-gradient-to-r from-indigo-400 to-cyan-400"
          title={$t('knowledge_board.export_graph', {default: 'Export SVG'})}
        >
          <Download size={24} />
        </button>
      {/if}
    </div>
  {/if}

  <div class="absolute bottom-4 right-4 z-50 flex items-center gap-2">
    <button
      on:click={toggleFullscreen}
      class="p-3 rounded-full transition-all hover:scale-110 active:scale-95 text-gray-400"
    >
      {#if isFullscreen}
        <Minimize2 size={30} />
      {:else}
        <Maximize2 size={30} />
      {/if}
    </button>
  </div>
</div>

<style>
  .bg-grid-pattern {
    background-color: #fdfbf7;
    background-image: linear-gradient(#e5e7eb 1px, transparent 1px),
      linear-gradient(90deg, #e5e7eb 1px, transparent 1px);
    background-size: 20px 20px;
  }

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
