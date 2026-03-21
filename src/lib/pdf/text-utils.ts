interface TextLikeItem {
  str: string;
  hasEOL?: boolean;
}

function isTextLikeItem(item: unknown): item is TextLikeItem {
  return !!item && typeof item === 'object' && typeof (item as {str?: unknown}).str === 'string';
}

export function buildPageText(items: unknown[]): string {
  const lines: string[] = [];
  let currentLine = '';

  for (const item of items) {
    if (!isTextLikeItem(item)) continue;

    const chunk = item.str.replace(/\s+/g, ' ').trim();
    if (!chunk) {
      if (item.hasEOL && currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      continue;
    }

    currentLine = currentLine ? `${currentLine} ${chunk}` : chunk;

    if (item.hasEOL) {
      lines.push(currentLine.trim());
      currentLine = '';
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildSnippet(text: string, maxLength: number = 280): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}
