export type QaCitation = {
  page: number;
  snippet: string;
};

export type QaAttachment = {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  kind: 'upload' | 'page-thumbnail';
  page?: number;
};

export type ChapterSourceFormat = 'markdown' | 'latex';

export type QaChapterReference = {
  id: string;
  title: string;
  path: string[];
  startPage: number;
  endPage: number;
  level: number;
};

export type QaScope =
  | {mode: 'current-page'; page: number}
  | {mode: 'page-range'; startPage: number; endPage: number}
  | {mode: 'page-ranges'; ranges: Array<{startPage: number; endPage: number}>}
  | {mode: 'chapter'; chapter: QaChapterReference; sourceFormat: ChapterSourceFormat};

export type QaMessageMeta = {
  mode: 'page' | 'chapter';
  label: string;
  sourceFormat?: ChapterSourceFormat;
  cacheHit?: boolean;
};

export type QaPanelMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: QaCitation[];
  meta?: QaMessageMeta;
  attachments?: QaAttachment[];
  scope?: QaScope;
  relatedUserMessageId?: string;
  format?: 'plain' | 'markdown';
};
