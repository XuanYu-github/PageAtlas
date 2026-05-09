import type * as PdfjsLibTypes from 'pdfjs-dist/legacy/build/pdf.mjs';
import {get} from 'svelte/store';
import {_} from 'svelte-i18n';

import {pdfService} from '../stores';

interface AiTocOptions {
  pdfInstance: PdfjsLibTypes.PDFDocumentProxy;
  ranges?: { start: number; end: number }[];
  startPage?: number;
  endPage?: number;
  apiKey?: string;
  provider?: string;
  doubaoEndpointIdText?: string;
  doubaoEndpointIdVision?: string;
  openaiBaseUrl?: string;
  openaiModelText?: string;
  openaiModelVision?: string;
}

function t(key: string, values?: Record<string, string | number>): string {
  return get(_)(key, { values }) as string;
}

export async function generateToc(
  {
    pdfInstance,
    ranges,
    startPage,
    endPage,
    apiKey,
    provider,
    doubaoEndpointIdText,
    doubaoEndpointIdVision,
    openaiBaseUrl,
    openaiModelText,
    openaiModelVision,
  }: AiTocOptions) {

  // Normalize ranges
  let finalRanges: { start: number; end: number }[] = [];
  if (ranges && ranges.length > 0) {
    finalRanges = ranges;
  } else if (startPage !== undefined && endPage !== undefined) {
    finalRanges = [{ start: startPage, end: endPage }];
  } else {
    throw new Error(t('error.no_page_ranges'));
  }

  const service = get(pdfService);
  if (!service) {
    throw new Error(t('error.pdf_service_not_init'));
  }

  const imagesBase64: string[] = [];
  let currentTotalSize = 0;
  const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
  let totalPageCount = 0;

  for (const range of finalRanges) {
    if (range.end < range.start) {
      continue; // Skip invalid ranges
    }

    for (let pageNum = range.start;pageNum <= range.end;pageNum++) {
      totalPageCount++;
      if (totalPageCount > 20) {
        throw new Error(t('error.too_many_pages', { max: 20 }));
      }

      const image = await service.getPageAsImage(pdfInstance, pageNum);

      currentTotalSize += image.length;
      if (currentTotalSize > MAX_PAYLOAD_SIZE) {
        throw new Error(t('error.payload_too_large'));
      }

      imagesBase64.push(image);
    }
  }

  if (imagesBase64.length === 0) {
    throw new Error(t('error.no_valid_pages'));
  }

  try {
    const {processTocInBrowser} = await import('$lib/client/ai');

    return await processTocInBrowser({
      images: imagesBase64,
      config: {
        apiKey,
        provider,
        doubaoEndpointIdText,
        doubaoEndpointIdVision,
        openaiBaseUrl,
        openaiModelText,
        openaiModelVision,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t('error.ai_failed');
    throw new Error(message);
  }
}
