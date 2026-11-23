/** Saves a blob as a file through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // revoking at once can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
