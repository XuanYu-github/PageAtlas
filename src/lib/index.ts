// place files you want to import through the `$lib` alias in this folder.

export function debounce<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, delay);
  };
}
