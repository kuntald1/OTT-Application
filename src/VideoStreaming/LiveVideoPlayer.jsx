import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// LiveVideoPlayer — plays a Mux HLS live playback URL via hls.js (or
// native HLS on Safari). Deliberately NO Google IMA SDK / ad cue
// points here — ads were explicitly scoped out of live streaming for
// this pass, unlike VideoBrowsePage.jsx's AdEnabledVideoPlayer for VOD.
// ---------------------------------------------------------------------------

function loadScriptOnce(src, isLoadedCheck) {
  return new Promise((resolve, reject) => {
    if (isLoadedCheck()) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export default function LiveVideoPlayer({ playbackUrl }) {
  const videoRef = useRef(null);
  const [loadError, setLoadError] = useState("");
  const hlsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const videoEl = videoRef.current;
      if (!videoEl || !playbackUrl) return;

      if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
        videoEl.src = playbackUrl;
        videoEl.play().catch(() => {});
        return;
      }

      try {
        await loadScriptOnce("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js", () => !!window.Hls);
        if (cancelled) return;
        if (!window.Hls || !window.Hls.isSupported()) {
          setLoadError("This browser can't play live video.");
          return;
        }
        const hls = new window.Hls({ liveDurationInfinity: true });
        hls.loadSource(playbackUrl);
        hls.attachMedia(videoEl);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
        hlsRef.current = hls;
      } catch (e) {
        setLoadError("Live playback couldn't load.");
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (e) {}
        hlsRef.current = null;
      }
    };
  }, [playbackUrl]);

  return (
    <div className="relative aspect-video w-full" style={{ background: "#000" }}>
      <video ref={videoRef} className="h-full w-full" playsInline controls autoPlay muted={false} />
      {loadError && (
        <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-red-400">{loadError}</p>
      )}
    </div>
  );
}
