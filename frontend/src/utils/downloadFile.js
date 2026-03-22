/**
 * Cross-platform file download utility.
 *
 * - Web: triggers a standard browser download (user configures folder in browser settings).
 * - iOS/Android (Capacitor): writes to the Documents directory and opens the
 *   native Share sheet so the user can save to Files, iCloud, etc.
 */
export async function downloadFile(blob, filename) {
  // Try native path first
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });

      await Share.share({ title: filename, url: result.uri });
      return;
    }
  } catch {
    // Capacitor not available or native write failed — fall through to web download
  }

  // Web fallback
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
