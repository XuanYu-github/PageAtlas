<script lang="ts">
  import {t} from 'svelte-i18n';
  import {createEventDispatcher} from 'svelte';
  import Dropzone from 'svelte-file-dropzone';

  import DropzoneView from '../DropzoneView.svelte';
  import PDFViewer from '../PDFViewer.svelte';
  import PDFControls from '../PDFControls.svelte';
  import PixelDialog from '../pixel/PixelDialog.svelte';
  import PixelPanel from '../pixel/PixelPanel.svelte';

  export let isFileLoading = false;
  export let isDragging = false;
  export let pdfState: any;
  export let originalPdfInstance: any;
  export let tocPdfInstance: any;

  export let isPreviewMode = false;
  export let isPreviewLoading = false;

  export let tocRanges: {start: number; end: number; id: string}[];
  export let activeRangeIndex: number;
  export let addPhysicalTocPage: boolean;
  export let tocPageCount: number;
  export let currentTocPath: any[] = []; // TocItem[]
  export let prefetchPageNum: number = 0;
  export let previewAnchorPage: number = 0;

  export let jumpToTocPage: () => Promise<void>;

  const dispatch = createEventDispatcher();
  let fileInputRef: HTMLInputElement;

  function handleFileInputChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      dispatch('fileselect', target.files[0]);
      target.value = '';
    }
  }

  function handleDrop(e: CustomEvent) {
    isDragging = false;
    const {acceptedFiles} = e.detail;
    if (acceptedFiles.length) {
      dispatch('fileselect', acceptedFiles[0]);
    }
  }

  function forwardFileLoadedEvent(e: CustomEvent) {
    dispatch('viewerMessage', e.detail);
  }
</script>

<div class="flex flex-col w-full workshop-preview self-stretch min-h-full">
  <PixelPanel
    variant="paper"
    padding="none"
    class="flex h-full min-h-[72vh] flex-col overflow-visible pb-0 lg:sticky lg:top-4 lg:h-[calc(100vh-2.5rem)] lg:min-h-[calc(100vh-2.5rem)]"
  >
    {#if isFileLoading}
      <PixelDialog
        open={true}
        variant="dialog"
        class="absolute"
        surfaceClass="p-5 text-center"
      >
        <div class="flex flex-col items-center gap-4">
          <div class="pixel-spinner pixel-spinner--lg"></div>
          <span class="pixel-loading-text text-base">{$t('status.loading_rendering')}</span>
        </div>
      </PixelDialog>
    {:else if !pdfState.instance}
      <Dropzone
        containerClasses="absolute inset-0 w-full h-full"
        accept=".pdf"
        disableDefaultStyles
        on:drop={handleDrop}
        on:dragenter={() => (isDragging = true)}
        on:dragleave={() => (isDragging = false)}
      >
        <DropzoneView
          {isDragging}
          hasInstance={!!pdfState.instance}
        />
      </Dropzone>
    {/if}

    {#if pdfState.instance}
      <div class="relative z-10 flex h-full min-h-0 flex-1 flex-col">
        <PDFViewer
          bind:pdfState
          mode={isPreviewMode ? 'single' : 'grid'}
          {originalPdfInstance}
          {tocPdfInstance}
          {tocPageCount}
          {tocRanges}
          {activeRangeIndex}
          on:updateActiveRange
          on:fileloaded={forwardFileLoadedEvent}
          {jumpToTocPage}
          {addPhysicalTocPage}
          {currentTocPath}
          {prefetchPageNum}
          {previewAnchorPage}
        />

        <input
          id="pdf-upload-input"
          name="pdf-upload"
          type="file"
          class="hidden"
          accept=".pdf"
          bind:this={fileInputRef}
          on:change={handleFileInputChange}
        />

        <PDFControls
          {isPreviewLoading}
          {isPreviewMode}
          {originalPdfInstance}
          doc={pdfState.doc}
          on:triggerUpload={() => fileInputRef?.click()}
          on:togglePreview={() => dispatch('togglePreview')}
          on:export={() => dispatch('export')}
        />
      </div>
    {/if}
  </PixelPanel>
</div>
