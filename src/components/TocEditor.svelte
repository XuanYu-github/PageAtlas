<script lang="ts">
  import {onDestroy, tick, createEventDispatcher} from 'svelte';
  import ShortUniqueId from 'short-unique-id';
  import {Sparkles, Loader2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown} from 'lucide-svelte';
  import {t} from 'svelte-i18n';
  import TocItem from './TocItem.svelte';
  import Tooltip from './Tooltip.svelte';
  import {tocItems, maxPage, autoSaveEnabled, dragDisabled, curFileFingerprint} from '../stores';
  import type {TocItem as TocEntry} from '$lib/pdf/service';

  import {dndzone} from 'svelte-dnd-action';
  import {flip} from 'svelte/animate';
  import {fly} from 'svelte/transition';

  type ApiConfig = {
    provider: string;
    apiKey: string;
    doubaoEndpointIdText?: string;
    doubaoEndpointIdVision?: string;
    openaiBaseUrl?: string;
    openaiModelText?: string;
    openaiModelVision?: string;
  };
  type FlatTocItem = {title: string; page: number; level: number};
  type TocStackEntry = {node: TocEntry; level: number};

  export let currentPage = 1;
  export let isPreview = false;
  export let pageOffset = 0;
  export let insertAtPage = 2;
  export let tocPageCount = 0;

  export let apiConfig: ApiConfig = {provider: '', apiKey: ''};
  const dispatch = createEventDispatcher();

  let flipDurationMs = 200;

  let text = ``;
  let isUpdatingFromEditor = false;
  let isProcessing = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Undo/Redo State
  let historyStack: TocEntry[][] = [];
  let futureStack: TocEntry[][] = [];
  const maxHistory = 20;
  let firstItemWithChildrenId: string | null = null;

  export function saveHistory() {
    const clone = structuredClone($tocItems);
    historyStack.push(clone);
    if (historyStack.length > maxHistory) {
      historyStack.shift();
    }
    futureStack = [];
    historyStack = historyStack; // update
  }

  function undo() {
    if (historyStack.length === 0) return;
    const current = structuredClone($tocItems);
    futureStack.push(current);
    const prev = historyStack.pop();
    if (!prev) return;
    $tocItems = prev;
    historyStack = historyStack;
    futureStack = futureStack;
  }

  function redo() {
    if (futureStack.length === 0) return;
    const current = structuredClone($tocItems);
    historyStack.push(current);
    const next = futureStack.pop();
    if (!next) return;
    $tocItems = next;
    historyStack = historyStack;
    futureStack = futureStack;
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const tagName = target.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable) return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        e.preventDefault();
        redo();
      } else {
        e.preventDefault();
        undo();
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  }

  let isDragging = false;
  let textGenTimer: ReturnType<typeof setTimeout> | undefined;

  let showNavHint = false;
  let navHintTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  function handleShowNavHint() {
    if (navHintTimer) clearTimeout(navHintTimer);
    showNavHint = true;
    navHintTimer = setTimeout(() => {
      showNavHint = false;
    }, 4000);
  }

  const unsubscribe = tocItems.subscribe((value) => {
    if (isUpdatingFromEditor) return;
    if (isDragging) return;

    clearTimeout(textGenTimer);
    textGenTimer = setTimeout(() => {
      const newText = generateText(value);
      if (newText !== text) {
        text = newText;
      }
    }, 300);
  });

  onDestroy(() => {
    unsubscribe();
    clearTimeout(textGenTimer);
    clearTimeout(debounceTimer);
  });

  $: if ($curFileFingerprint) {
    historyStack = [];
    futureStack = [];
  }

  function buildTree(items: FlatTocItem[]): TocEntry[] {
    const root: TocEntry[] = [];
    const stack: TocStackEntry[] = [];
    const uid = new ShortUniqueId({length: 10});

    items.forEach((item: FlatTocItem) => {
      const newItem: TocEntry = {
        id: uid.randomUUID(),
        title: item.title,
        to: Number(item.page) || 1,
        children: [],
        open: true,
      };

      if (item.page > $maxPage) $maxPage = item.page;

      const level = item.level;

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(newItem);
      } else {
        const parent = stack[stack.length - 1]?.node;
        if (!parent) return;
        parent.children.push(newItem);
      }
      stack.push({node: newItem, level});
    });
    return root;
  }

  async function handleAiFormat() {
    if (!text.trim()) return;

    const MAX_TEXT_SIZE = 128 * 1024;
    const byteSize = new TextEncoder().encode(text).length;

    if (byteSize > MAX_TEXT_SIZE) {
      throw new Error(`Text content is too large. Limit is 128KB.`);
    }

    isProcessing = true;
    let aiResult: FlatTocItem[] = [];

    try {
      const {processTocInBrowser} = await import('$lib/client/ai');

      aiResult = await processTocInBrowser({
        text,
        config: {
          apiKey: apiConfig.apiKey,
          provider: apiConfig.provider,
          doubaoEndpointIdText: apiConfig.doubaoEndpointIdText,
          doubaoEndpointIdVision: apiConfig.doubaoEndpointIdVision,
          openaiBaseUrl: apiConfig.openaiBaseUrl,
          openaiModelText: apiConfig.openaiModelText,
          openaiModelVision: apiConfig.openaiModelVision,
        },
      }) as FlatTocItem[];
    } finally {
      isProcessing = false;
    }

    if (Array.isArray(aiResult) && aiResult.length > 0) {
      const nestedItems = buildTree(aiResult);
      dispatch('aiFormatResponse', {
        items: nestedItems,
      });
    } else {
      throw new Error('AI could not parse any ToC structure.');
    }
  }

  function parseText(text: string): TocEntry[] {
    const lines = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean);
    const items: TocEntry[] = [];
    const stack: Array<{level: number; item: {children: TocEntry[]}}> = [{level: 0, item: {children: items}}];
    const uid = new ShortUniqueId({length: 10});

    lines.forEach((line: string) => {
      const match = line.match(/^(\d+(?:\.\d+)*)\s+(.*?)\s+(-?\d+)$/);
      if (match) {
        const [, number, title, pageStr] = match;
        const level = number.split('.').length;
        const page = parseInt(pageStr);

        const newItem: TocEntry = {
          id: uid.randomUUID(),
          title,
          to: page,
          children: [],
          open: true,
        };

        if (page > $maxPage) $maxPage = page;

        while (stack[stack.length - 1].level >= level) stack.pop();
        stack[stack.length - 1].item.children.push(newItem);
        stack.push({level, item: newItem});
      }
    });
    return items;
  }

  function generateText(items: TocEntry[], prefix = ''): string {
    return items
      .map((item: TocEntry, index: number) => {
        const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
        let txt = `${number} ${item.title} ${item.to}`;
        if (item.children?.length) txt += '\n' + generateText(item.children, number);
        return txt;
      })
      .join('\n');
  }

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLTextAreaElement;
    isUpdatingFromEditor = true;
    text = target.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const parsed = parseText(text);
      if (parsed.length > 0) {
        $tocItems = parsed;
      }
      tick().then(() => {
        isUpdatingFromEditor = false;
      });
    }, 300);
  }

  const handleDragStart = () => {
    if (!isDragging) {
      saveHistory();
      $autoSaveEnabled = false;
      isDragging = true;
    }
  };

  const handleDragEnd = () => {
    tick().then(() => {
      isDragging = false;
      const newText = generateText($tocItems);
      if (newText !== text) text = newText;
      $autoSaveEnabled = true;
    });
  };

  function handleMouseUp() {
    $dragDisabled = true;
  }

  function handleChildJumpToPage(e: CustomEvent<{to: number}>) {
    dispatch('jumpToPage', e.detail);
  }

  function handleDndConsider(e: CustomEvent<{items: TocEntry[]}>) {
    handleDragStart();
    $tocItems = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<{items: TocEntry[]}>) {
    $tocItems = e.detail.items;
    handleDragEnd();
  }

  $: firstItemWithChildrenId = (() => {
    const findFirst = (items: TocEntry[]): string | null => {
      for (const item of items) {
        if (item.children?.length > 0) return item.id;
        if (item.children) {
          const childResult = findFirst(item.children);
          if (childResult) return childResult;
        }
      }
      return null;
    };
    return findFirst($tocItems);
  })();

  const addMultipleTocItems = (count: number) => {
    saveHistory();
    const currentItems: TocEntry[] = $tocItems;
    let startPage: number;

    if (currentItems.length > 0) {
      startPage = Math.max(...currentItems.map((i) => i.to)) + 1;
    } else {
      startPage = ($maxPage || 0) + 1;
    }

    const uid = new ShortUniqueId({length: 10});
    const newItems = Array.from({length: count}, (_, i) => ({
      id: uid.randomUUID(),
      title: '',
      to: startPage + i,
      children: [],
      open: true,
    }));

    $tocItems = [...currentItems, ...newItems];
  };

  const toggleAll = (open: boolean) => {
    flipDurationMs = 0;
    const updateRecursive = (items: TocEntry[]): TocEntry[] =>
      items.map((item) => ({
        ...item,
        open,
        children: item.children?.length ? updateRecursive(item.children) : [],
      }));
    $tocItems = updateRecursive($tocItems);
    tick().then(() => {
      setTimeout(() => {
        flipDurationMs = 200;
      }, 50);
    });
  };

  const expandAll = () => toggleAll(true);
  const collapseAll = () => toggleAll(false);

  $: hasAnyExpanded = $tocItems.some((item) => item.open);

  const addTocItem = () => {
    addMultipleTocItems(1);
  };

  const updateTocItem = (item: TocEntry, updates: Partial<TocEntry>, skipHistory = false) => {
    if (!skipHistory) {
      saveHistory();
    }
    const updateItemRecursive = (items: TocEntry[]): TocEntry[] =>
      items.map((currentItem: TocEntry) => {
        if (currentItem.id === item.id) return {...currentItem, ...updates};
        if (currentItem.children?.length) {
          return {...currentItem, children: updateItemRecursive(currentItem.children)};
        }
        return currentItem;
      });
    $tocItems = updateItemRecursive($tocItems);
  };

  const deleteTocItem = (itemToDelete: TocEntry) => {
    saveHistory();
    const deleteItemRecursive = (items: TocEntry[]): TocEntry[] =>
      items.filter((item: TocEntry) => {
        if (item.id === itemToDelete.id) return false;
        if (item.children?.length) item.children = deleteItemRecursive(item.children);
        return true;
      });
    $tocItems = deleteItemRecursive($tocItems);
  };

  const TOC_REGEX = /^(\d+(?:\.\d+)*)\s+(.*?)\s+(-?\d+)$/;

  $: hasInvalidLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => !TOC_REGEX.test(line));

  $: promptTooltipText = $t('toc.prompt_intro');
  let innerWidth: number;
</script>

<svelte:window
  on:keydown={handleKeydown}
  on:mouseup={handleMouseUp}
  on:touchend={handleMouseUp}
  bind:innerWidth
/>

<div class="flex flex-col gap-4 mt-3">
  <div class="h-48 relative group">
    <textarea
      placeholder={$t('toc.outline_placeholder')}
      bind:value={text}
      on:input={handleInput}
      class="w-full h-full border-2 border-black rounded-lg p-2 text-sm myfocus leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none pr-10"
    ></textarea>

    {#if hasInvalidLines}
      <div class="absolute bottom-3 right-3">
        <Tooltip
          isTextCopiable
          width="md:w-[350px] w-[250px]"
          text={promptTooltipText}
          position={innerWidth < 1024 ? '-200 -500' : '100 -600'}
        >
          <button
            on:click={handleAiFormat}
            disabled={isProcessing || !text.trim()}
            class="flex items-center gap-1.5 bg-gradient-to-br from-blue-300 to-pink-600 text-white px-3 py-1.5 rounded-md shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            {#if isProcessing}
              <Loader2
                size={16}
                class="animate-spin"
              />
              <span class="text-xs font-bold">Processing...</span>
            {:else}
              <Sparkles size={16} />
              <span class="text-xs font-bold">AI Format</span>
            {/if}
          </button>
        </Tooltip>
      </div>
    {/if}
  </div>

  <div class="-ml-8 group/toc-list pt-2 relative">
    {#if $tocItems.length > 0}
      <div
        class="flex items-center gap-1 sticky top-12 z-20 opacity-0 group-hover/toc-list:opacity-100 transition-all duration-300 translate-y-1 group-hover/toc-list:translate-y-0 pointer-events-none"
      >
        {#if firstItemWithChildrenId}
          <div class="-ml-2.5 -mb-8 pointer-events-auto bg-white/50 backdrop-blur-sm rounded-md shadow-sm">
            {#if hasAnyExpanded}
              <button
                on:click={collapseAll}
                class="p-1 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
                title={$t('toc.collapse_all')}
              >
                <ChevronsDownUp size={17} font-weight={600} />
              </button>
            {:else}
              <button
                on:click={expandAll}
                class="p-1 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
                title={$t('toc.expand_all')}
              >
                <ChevronsUpDown size={17} font-weight={600} />
              </button>
            {/if}
          </div>
        {/if}
      </div>

      {#if showNavHint}
        <div class="absolute right-0 top-0 z-50 h-6 flex justify-center pointer-events-none">
          <div 
            transition:fly={{y: -10, duration: 300}}
            class="bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg pointer-events-none"
          >
            {$t('toc.nav_hint')}
          </div>
        </div>
      {/if}

      <section
        use:dndzone={{
          items: $tocItems,
          flipDurationMs,
          dragDisabled: $dragDisabled,
          dropTargetStyle: {outline: '2px dashed #000', borderRadius: '8px'},
        }}
        on:consider={handleDndConsider}
        on:finalize={handleDndFinalize}
        class="min-h-[20px]"
      >
        {#each $tocItems as item, i (item.id)}
          <div animate:flip={{duration: flipDurationMs}}>
            <TocItem
              {item}
              {flipDurationMs}
              onUpdate={updateTocItem}
              onDelete={deleteTocItem}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              {currentPage}
              {isPreview}
              {pageOffset}
              {insertAtPage}
              {tocPageCount}
              on:showNavHint={handleShowNavHint}
              on:hoveritem
              on:jumpToPage={handleChildJumpToPage}
              index={i + 1}
            />
          </div>
        {/each}
      </section>
    {/if}

    <div class="flex items-center gap-2 ml-8 mt-3 mb-4">
      <button
        on:click={addTocItem}
        class="btn font-bold bg-yellow-400 text-black border-2 border-black rounded-lg px-4 py-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
      >
        {$t('btn.add_chapter')}
      </button>
      <button
        on:click={() => addMultipleTocItems(5)}
        class="btn font-bold bg-gray-100 text-black border-2 border-black rounded-lg px-3 py-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-sm"
      >
        +5
      </button>
      <button
        on:click={() => addMultipleTocItems(10)}
        class="btn font-bold bg-gray-100 text-black border-2 border-black rounded-lg px-3 py-2 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-sm"
      >
        +10
      </button>
    </div>
  </div>
</div>
