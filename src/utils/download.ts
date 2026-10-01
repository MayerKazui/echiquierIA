/** Offers `text` to the user as a file to save (the browser's download), without a server. */
export function downloadTextFile(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked later: some browsers start the download after the click returns
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
