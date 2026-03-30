export async function openExternalUrl(url: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('__TAURI_INTERNALS__' in window) {
      const {openUrl} = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    }
  } catch (error) {
    console.error('Failed to open external URL with desktop opener', error);
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
