// Shared "Option A" upload helper — the browser sends the file
// DIRECTLY to Bunny Stream over the TUS resumable protocol, never
// through our own VPS. Our backend's only job is minting short-lived,
// presigned credentials (see getTusUploadCredentials/confirmVideoUpload
// in api.js and adminApi.js) — the multi-GB transfer itself never
// touches our server's bandwidth or memory, and survives a dropped
// connection by resuming from wherever it left off.
//
// getCredentials/confirmUpload are injected so this file has no
// knowledge of auth tokens or which base URL to call — the creator
// and admin upload forms each pass in their own (see MyVideoListPage.jsx
// and AdminVideoEditForm.jsx).
import * as tus from "tus-js-client";

const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

/**
 * @param {File} file
 * @param {() => Promise<{video_id: string, library_id: string, expiration_time: number, signature: string}>} getCredentials
 * @param {() => Promise<void>} confirmUpload
 * @param {(percent: number) => void} onProgress
 * @param {() => void} onSuccess
 * @param {(message: string) => void} onError
 * @returns {{ abort: () => void }} — lets the caller cancel an in-flight upload
 */
export function startResumableVideoUpload({ file, getCredentials, confirmUpload, onProgress, onSuccess, onError }) {
  let cancelled = false;
  let uploadRef = null;

  getCredentials()
    .then((creds) => {
      if (cancelled) return;

      const upload = new tus.Upload(file, {
        endpoint: BUNNY_TUS_ENDPOINT,
        retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000],
        // Bunny needs these on every request, not just the first —
        // see the TUS docs' 401 troubleshooting note.
        headers: {
          AuthorizationSignature: creds.signature,
          AuthorizationExpire: String(creds.expiration_time),
          VideoId: creds.video_id,
          LibraryId: creds.library_id,
        },
        metadata: {
          filetype: file.type,
          title: file.name,
        },
        // Keyed on name+size+type+mtime by default — good enough to
        // recognize "same file, re-selected after a closed tab or
        // reload" without us tracking anything extra ourselves.
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,
        onError: (error) => {
          if (cancelled) return;
          onError?.(error?.message || "Upload failed. Please try again.");
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          if (cancelled) return;
          onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
        },
        onSuccess: () => {
          if (cancelled) return;
          confirmUpload()
            .then((result) => onSuccess?.(result))
            .catch((err) => onError?.(err?.message || "Upload finished but couldn't be confirmed. Please refresh and check."));
        },
      });
      uploadRef = upload;

      // Resume support — if a previous attempt for this exact file
      // (same name/size/type/last-modified) left off partway, this
      // finds it and continues from there instead of restarting.
      upload.findPreviousUploads().then((previousUploads) => {
        if (cancelled) return;
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
    })
    .catch((err) => {
      if (!cancelled) onError?.(err?.message || "Couldn't start the upload.");
    });

  return {
    abort: () => {
      cancelled = true;
      uploadRef?.abort();
    },
  };
}
