<script lang="ts">
  import ShortUniqueId from 'short-unique-id';
  import {maxPage, tocConfig, dragDisabled} from '../stores';
  import {createEventDispatcher} from 'svelte';
  import {t} from 'svelte-i18n';
  import {dndzone} from 'svelte-dnd-action';
  import {flip} from 'svelte/animate';
  import type { TocItem } from '$lib/pdf/service';
  import PixelIcon from './icons/PixelIcon.svelte';
  import {iconChevronDown, iconChevronRight, iconGrip, iconPlus, iconTrash} from './icons';

  export let item: TocItem;
  export let onUpdate: (item: TocItem, updates: Partial<TocItem>, skipHistory?: boolean) => void;
  export let onDelete: (item: TocItem) => void;
  export let onDragStart: () => void = () => {};
  export let onDragEnd: () => void = () => {};

  export let currentPage = 1;
  export let isPreview = false;
  export let pageOffset = 0;
  export let insertAtPage = 2;
  export let tocPageCount = 0;
  
  // Numbering props
  export let prefix = '';
  export let index = 0;

  const dispatch = createEventDispatcher<{
    hoveritem: { to: number };
    jumpToPage: { to: number };
    showNavHint: void;
  }>();
  export let flipDurationMs = 200;

  let editTitle = item ? item.title : '';
  let editPage = item ? item.to : 1;
  let isFocused = false;
  let isPageFocused = false;
  
  $: currentNumber = prefix ? `${prefix}.${index}` : `${index}`;

  $: if (item && !isFocused && item.title !== editTitle) {
    editTitle = item.title;
  }

  $: if (item && !isPageFocused && item.to !== editPage) {
    editPage = item.to;
  }

  $: physicalContentPage = item.to + pageOffset;
  $: targetPageInPreview =
    physicalContentPage >= insertAtPage ? physicalContentPage + tocPageCount : physicalContentPage;

  $: isActive = isPreview && currentPage === targetPageInPreview;

  function handleToggle() {
    item.open = !item.open;
    onUpdate(item, {open: item.open});
  }

  function handleUpdateTitle() {
    onUpdate(item, {title: editTitle});
  }

  function handleUpdatePage() {
    const page = Math.floor(editPage);
    if (!isNaN(page) && page !== item.to) {
      onUpdate(item, {to: page});
    }
  }

  function handlePageInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value);
    if (!isNaN(val) && val > 0) {
      dispatch('jumpToPage', {to: val});
    }
  }

  function handleAddChild() {
    const currentChildren = item.children || [];
    let startPage;

    if (currentChildren.length > 0) {
      startPage = Math.max(...currentChildren.map((c) => c.to)) + 1;
    } else {
      startPage = item.to + 1;
    }

    const newChild = {
      id: new ShortUniqueId({length: 10}).randomUUID(),
      title: '',
      to: startPage,
      children: [],
      open: true,
    };
    
    const updatedChildren = [...currentChildren, newChild];
    onUpdate(item, {children: updatedChildren, open: true});
  }

  function handleUpdateChild(childItem: TocItem, updates: Partial<TocItem>, skipHistory = false) {
    const updatedChildren = (item.children || []).map((child) =>
      child.id === childItem.id ? {...child, ...updates} : child,
    );
    onUpdate(item, {children: updatedChildren}, skipHistory);
  }

  function handleDeleteChild(childItem: TocItem) {
    const updatedChildren = (item.children || []).filter((c) => c.id !== childItem.id);
    onUpdate(item, {children: updatedChildren});
  }

  function handleMouseEnter() {
    if (item) {
      dispatch('hoveritem', {to: item.to});
    }
  }

  function handleDndConsider(e: CustomEvent<{items: TocItem[]}>) {
    onDragStart();
    item.children = e.detail.items;
    item = item;
  }

  function handleDndFinalize(e: CustomEvent<{items: TocItem[]}>) {
    item.children = e.detail.items;
    item = item;
    onUpdate(item, {children: item.children}, true);
    onDragEnd();
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('.toc-item-title'));
      const target = e.target as HTMLInputElement;
      const index = allInputs.indexOf(target);
      if (index !== -1) {
        if (e.key === 'ArrowUp' && index > 0) {
          allInputs[index - 1].focus();
        } else if (e.key === 'ArrowDown' && index < allInputs.length - 1) {
          allInputs[index + 1].focus();
        }
      }
    }
  }

  function handleTitleFocus() {
    isFocused = true;
    const expiryStr = localStorage.getItem('pageatlas_edit_title_toast_until');
    const now = Date.now();
    if (!expiryStr || now > parseInt(expiryStr, 10)) {
       dispatch('showNavHint');
       const newExpiry = now + 30 * 24 * 60 * 60 * 1000;
       localStorage.setItem('pageatlas_edit_title_toast_until', newExpiry.toString());
    }
  }
</script>

{#if item}
  <div>
    <div
      class="quest-row flex items-center gap-1 px-2 py-2 group -mr-1 mb-1"
      on:mouseenter={handleMouseEnter}
      role="presentation"
      class:is-active={isActive}
      class:font-bold={isActive}
    >
      <div 
        class="flex items-center gap-1 flex-1 min-w-0 h-full"
        role="presentation"
        on:mousedown={() => ($dragDisabled = false)}
        on:touchstart={() => ($dragDisabled = false)}
      >
        <div
          class="farm-icon-button w-8 h-8 cursor-grab active:cursor-grabbing transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <PixelIcon size={14} pixels={iconGrip} />
        </div>

        <button
          on:click|stopPropagation={handleToggle}
          class="farm-icon-button w-8 h-8 ml-[-4px]"
          class:invisible={!item.children || item.children.length === 0}
          title="Toggle"
        >
          {#if item.open}
            <PixelIcon size={16} pixels={iconChevronDown} />
          {:else}
            <PixelIcon size={16} pixels={iconChevronRight} />
          {/if}
        </button>

        {#if $tocConfig.prefixSettings.enabled}
          <span class="farm-badge text-xs select-none pr-1 min-w-[3rem] justify-center">
            {currentNumber}
          </span>
        {/if}

        <input
          type="text"
          bind:value={editTitle}
          on:focus={handleTitleFocus}
          on:blur={() => {
            isFocused = false;
            handleUpdateTitle();
          }}
          on:keydown={handleTitleKeydown}
          on:keypress={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
          placeholder={prefix === '' ? $t('toc.new_chapter_default') : ($t('toc.new_item_default') || 'New Item')}
          class="toc-item-title inventory-slot px-2 py-1 text-sm myfocus focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[100px] placeholder:text-[color:var(--pa-ink-soft)]"
        />
      </div>


      <input
        type="number"
        bind:value={editPage}
        on:input={handlePageInput}
        on:focus={() => (isPageFocused = true)}
        on:blur={() => {
          isPageFocused = false;
          handleUpdatePage();
        }}
        on:keypress={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
        class="inventory-slot w-14 ml-1 pl-1.5 py-1 text-sm myfocus focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div class="flex">
        <button
          on:click={handleAddChild}
          class="farm-icon-button w-8 h-8"
          title="Add Child"
        >
          <PixelIcon size={16} pixels={iconPlus} />
        </button>
        <button
          on:click={() => onDelete(item)}
          class="farm-icon-button w-8 h-8 text-[color:var(--pa-berry)]"
          title="Delete"
        >
          <PixelIcon size={16} pixels={iconTrash} />
        </button>
      </div>
    </div>

    {#if item.open}
      <div
        class="ml-6 pl-3 border-l-[3px] border-[color:rgba(77,45,23,0.26)] hover:border-[color:var(--pa-bark)] transition-colors"
        use:dndzone={{
          items: item.children || [],
          flipDurationMs,
          dragDisabled: $dragDisabled,
          dropTargetStyle: item.children?.length > 0 ? {outline: '2px dashed #000', borderRadius: '4px'} : {},
        }}
        on:consider={handleDndConsider}
        on:finalize={handleDndFinalize}
      >
        {#each item.children || [] as child, i (child.id)}
          <div animate:flip={{duration: flipDurationMs}}>
            <svelte:self
              prefix={currentNumber}
              index={i + 1}
              item={child}
              {flipDurationMs}
              onUpdate={handleUpdateChild}
              onDelete={handleDeleteChild}
              {onDragStart}
              {onDragEnd}
              {currentPage}
              {isPreview}
              {pageOffset}
              {insertAtPage}
              {tocPageCount}
              on:showNavHint
              on:hoveritem
              on:jumpToPage={(e: CustomEvent<{to: number}>) => dispatch('jumpToPage', e.detail)}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
