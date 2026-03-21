import type {TocItem} from '$lib/pdf/service';
import type {QaChapterReference} from '$lib/types/pdf-qa';

const ROOT_TITLES = new Set(['contents', 'table of contents', '目录']);

type FlatTocNode = {
  id: string;
  title: string;
  path: string[];
  startPage: number;
  level: number;
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function shouldSkipNode(item: TocItem, path: string[]): boolean {
  return path.length === 0 && item.children.length > 0 && ROOT_TITLES.has(normalizeTitle(item.title));
}

function flattenTocNodes(
  items: TocItem[],
  pageOffset: number,
  totalPages: number,
  path: string[] = [],
  acc: FlatTocNode[] = []
): FlatTocNode[] {
  for (const item of items) {
    if (shouldSkipNode(item, path)) {
      flattenTocNodes(item.children || [], pageOffset, totalPages, path, acc);
      continue;
    }

    const startPage = item.to + pageOffset;
    const nextPath = [...path, item.title];

    if (startPage >= 1 && startPage <= totalPages) {
      acc.push({
        id: item.id,
        title: item.title,
        path: nextPath,
        startPage,
        level: nextPath.length,
      });
    }

    if (item.children && item.children.length > 0) {
      flattenTocNodes(item.children, pageOffset, totalPages, nextPath, acc);
    }
  }

  return acc;
}

export function buildQaChapterReferences(
  items: TocItem[],
  pageOffset: number,
  totalPages: number
): QaChapterReference[] {
  if (totalPages <= 0) return [];

  const flatNodes = flattenTocNodes(items, pageOffset, totalPages);

  return flatNodes.reduce<QaChapterReference[]>((chapters, node, index) => {
    let endPage = totalPages;

    for (let nextIndex = index + 1; nextIndex < flatNodes.length; nextIndex += 1) {
      const nextNode = flatNodes[nextIndex];
      if (nextNode.level <= node.level) {
        endPage = nextNode.startPage - 1;
        break;
      }
    }

    if (endPage < node.startPage) {
      endPage = node.startPage;
    }

    chapters.push({
      id: node.id,
      title: node.title,
      path: node.path,
      startPage: node.startPage,
      endPage,
      level: node.level,
    });

    return chapters;
  }, []);
}

export function findCurrentQaChapter(
  chapters: QaChapterReference[],
  currentTocPath: TocItem[],
  currentContentPage: number | null
): QaChapterReference | null {
  if (chapters.length === 0 || currentContentPage === null) {
    return null;
  }

  const pathIds = currentTocPath.map((item) => item.id);
  for (let index = pathIds.length - 1; index >= 0; index -= 1) {
    const matched = chapters.find((chapter) => chapter.id === pathIds[index]);
    if (matched) {
      return matched;
    }
  }

  return chapters.find((chapter) => currentContentPage >= chapter.startPage && currentContentPage <= chapter.endPage) || null;
}
