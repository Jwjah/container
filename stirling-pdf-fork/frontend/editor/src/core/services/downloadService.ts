export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
  /** Workspace fileId of the file being exported, when known. Lets export-time
   *  policy enforcement version the in-editor file (not just the download). */
  fileId?: string;
}

export interface DownloadResult {
  savedPath?: string;
  cancelled?: boolean;
}

export async function downloadFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
  if (window !== window.parent) {
    console.log("[downloadService] Intercepting download for iframe, posting message");
    const fileToPost = request.data instanceof File 
        ? request.data 
        : new File([request.data], request.filename, { type: request.data.type || 'application/pdf' });
        
    window.parent.postMessage({ type: 'SAVE_FILE', file: fileToPost }, '*');
    return { savedPath: request.localPath };
  }

  const url = URL.createObjectURL(request.data);

  const link = document.createElement("a");
  link.href = url;
  link.download = request.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  return { savedPath: request.localPath };
}

export async function downloadFromUrl(
  url: string,
  filename: string,
  localPath?: string,
): Promise<DownloadResult> {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return { savedPath: localPath };
}
