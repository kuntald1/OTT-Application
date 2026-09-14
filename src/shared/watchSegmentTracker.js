// Tracks the CURRENT continuously-watched stretch of a video's own
// timeline (in seconds from video start), for the range-based revenue
// crediting model (see backend/app/routers/watch.py's
// _merge_watched_range and VideoWatchRecord's docstring for the full
// reasoning). Deliberately dumb and player-agnostic — both the Bunny
// iframe path (via player.js's timeupdate/seeked events) and the
// native <video> path (AdEnabledVideoPlayer's own timeupdate/seeking
// events) feed it the same way.
//
// Resending an already-reported (or overlapping) segment is always
// safe: the backend's watched-ranges union merge is idempotent, so
// there's no need to "advance" the tracked start after each periodic
// flush — only an actual seek should start a new segment.
export function createWatchSegmentTracker() {
  let segmentStart = null;
  let lastPos = null;

  return {
    // Call on every timeupdate-equivalent event with the player's
    // current position in seconds.
    reportPosition(pos) {
      if (typeof pos !== "number" || Number.isNaN(pos)) return;
      if (segmentStart === null) segmentStart = pos;
      lastPos = pos;
    },
    // Returns the current segment (or null if nothing tracked yet) —
    // read this BEFORE calling reset() when a seek is detected, so
    // the caller can flush what was actually watched before the jump.
    getSegment() {
      return segmentStart !== null && lastPos !== null && lastPos > segmentStart
        ? { start: segmentStart, end: lastPos }
        : null;
    },
    // Call right after a seek/drag is detected (once the pre-seek
    // segment has been flushed) — the next reportPosition() call
    // starts a brand new segment instead of extending the old one.
    reset() {
      segmentStart = null;
      lastPos = null;
    },
  };
}
