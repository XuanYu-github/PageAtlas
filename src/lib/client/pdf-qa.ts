import type * as PdfjsLibTypes from 'pdfjs-dist/legacy/build/pdf.mjs';

import {buildSnippet, buildPageText} from '$lib/pdf/text-utils';
import type {BrowserAiConfig, BrowserVisionMessage} from '$lib/client/ai-config';
import type {ChapterSourceFormat, QaAttachment, QaChapterReference, QaScope} from '$lib/types/pdf-qa';

export interface LocalQaPageText {
  page: number;
  text: string;
  snippet: string;
  charCount: number;
}

export async function extractPdfPagesInBrowser(
  pdf: PdfjsLibTypes.PDFDocumentProxy,
  options: {
    onPageCount?: (pageCount: number) => void;
    onPageProcessed?: (processedPageCount: number, pageCount: number) => void;
  } = {}
): Promise<LocalQaPageText[]> {
  options.onPageCount?.(pdf.numPages);

  const pages: LocalQaPageText[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);

    try {
      const content = await page.getTextContent();
      const text = buildPageText(content.items as unknown[]);
      pages.push({
        page: pageNumber,
        text,
        snippet: buildSnippet(text),
        charCount: text.length,
      });
      options.onPageProcessed?.(pageNumber, pdf.numPages);
    } finally {
      page.cleanup();
    }
  }

  return pages;
}

export function buildChapterContextInBrowser(
  chapter: QaChapterReference,
  pages: LocalQaPageText[],
  sourceFormat: ChapterSourceFormat
): string {
  const pageText = pages.filter((page) => page.text.trim().length > 0);

  if (sourceFormat === 'latex') {
    const command = chapter.level <= 1
      ? '\\chapter'
      : chapter.level === 2
        ? '\\section'
        : chapter.level === 3
          ? '\\subsection'
          : '\\subsubsection';
    return `${command}{${chapter.title}}\n% Path: ${chapter.path.join(' > ')}\n% Pages: ${chapter.startPage}-${chapter.endPage}\n\n${pageText.map((page) => `\\section*{Page ${page.page}}\n${page.text}`).join('\n\n')}`.trim();
  }

  const headingLevel = Math.min(Math.max(chapter.level, 1), 6);
  return `${'#'.repeat(headingLevel)} ${chapter.title}\n\nPath: ${chapter.path.join(' > ')}\nPages: ${chapter.startPage}-${chapter.endPage}\n\n${pageText.map((page) => `## Page ${page.page}\n${page.text}`).join('\n\n')}`.trim();
}

export function selectPagesFromScope(scope: QaScope, pages: LocalQaPageText[]): LocalQaPageText[] {
  if (scope.mode === 'current-page') {
    return pages.filter((page) => page.page === scope.page);
  }

  if (scope.mode === 'page-range') {
    return pages.filter((page) => page.page >= scope.startPage && page.page <= scope.endPage);
  }

  if (scope.mode === 'page-ranges') {
    return pages.filter((page) => scope.ranges.some((range) => page.page >= range.startPage && page.page <= range.endPage));
  }

  return pages.filter((page) => page.page >= scope.chapter.startPage && page.page <= scope.chapter.endPage);
}

export async function askLocalPdfQuestion(options: {
  question: string;
  scope: QaScope;
  pages: LocalQaPageText[];
  config: BrowserAiConfig;
  getPageImage: (pageNumber: number) => Promise<string>;
  userImages?: QaAttachment[];
}): Promise<{answer: string; citations: Array<{page: number; snippet: string}>; provider: string}> {
  const selectedPages = selectPagesFromScope(options.scope, options.pages);
  const citationPages = selectedPages.map((page) => page.page);
  const textPages = selectedPages.filter((page) => page.text.trim().length > 0);
  const imagePages = selectedPages.filter((page) => page.text.trim().length === 0).slice(0, 6);

  let textContext = '';
  if (options.scope.mode === 'chapter') {
    textContext = buildChapterContextInBrowser(options.scope.chapter, textPages, options.scope.sourceFormat);
  } else {
    textContext = textPages.map((page) => `[Page ${page.page}]\n${page.text}`).join('\n\n---\n\n');
  }

  const images: BrowserVisionMessage[] = await Promise.all(
    imagePages.map(async (page) => ({
      page: page.page,
      imageDataUrl: await options.getPageImage(page.page),
    })),
  );

  const uploadedImages: BrowserVisionMessage[] = (options.userImages || []).map((image, index) => ({
    page: -(index + 1),
    imageDataUrl: image.dataUrl,
  }));

  const {answerPdfQuestionInBrowser} = await import('$lib/client/ai');
  const result = await answerPdfQuestionInBrowser({
    question: options.question,
    citations: citationPages,
    textContext,
    images: [...images, ...uploadedImages],
    config: options.config,
  });

  return {
    answer: result.answer,
    provider: result.provider,
    citations: result.citations.map((pageNumber) => {
      const matched = selectedPages.find((page) => page.page === pageNumber);
      return {
        page: pageNumber,
        snippet: matched?.snippet || '',
      };
    }),
  };
}
