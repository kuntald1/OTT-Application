import React, { useEffect, useState } from "react";
import { ArrowLeft, Radio, Plus, Copy, Check, Square, Eye, EyeOff, Trash2 } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { createMyLiveStream, fetchMyLiveStreams, endMyLiveStream, deleteMyLiveStream } from "../api";
import { useApp } from "../context/AppContext";
import ConfirmDialog from "../shared/ConfirmDialog";

// ---------------------------------------------------------------------------
// Creator/Organiser's own live streaming — gated by
// profile.can_live_stream, an admin-toggled permission (see Admin >
// User Management). Not shown at all if the account doesn't have it.
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  idle: { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.6)" },
  active: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  ended: { bg: "rgba(255,255,255,0.05)", color: "rgba(245,235,221,0.4)" },
};

function CopyableField({ label, value, secret }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mb-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(245,235,221,0.05)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <code className="flex-1 truncate text-xs" style={{ color: COLORS.cream }}>
          {revealed ? value : "•".repeat(24)}
        </code>
        {secret && (
          <button type="button" onClick={() => setRevealed((r) => !r)} style={{ color: "rgba(245,235,221,0.5)" }}>
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        <button type="button" onClick={handleCopy} style={{ color: copied ? "#6FCF97" : COLORS.gold }}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function MyLiveStreamsPage({ onBack }) {
  const { profile } = useApp();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [section, setSection] = useState("play");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  const load = () => {
    setLoading(true);
    fetchMyLiveStreams()
      .then(setStreams)
      .catch(() => setStreams([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (!profile?.can_live_stream) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm font-medium" style={{ color: COLORS.gold }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Live streaming isn't enabled for your account yet — ask an admin to turn it on.
        </p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!title.trim()) return;
    setError("");
    setCreating(true);
    try {
      const result = await createMyLiveStream(title.trim(), description.trim(), section);
      setJustCreated(result);
      setTitle("");
      setDescription("");
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create live stream.");
    } finally {
      setCreating(false);
    }
  };

  const [confirmEndStream, setConfirmEndStream] = useState(null);
  const [confirmDeleteStream, setConfirmDeleteStream] = useState(null);

  const handleEndConfirmed = async () => {
    const stream = confirmEndStream;
    setBusyId(stream.id);
    setError("");
    try {
      await endMyLiveStream(stream.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't end live stream.");
    } finally {
      setBusyId(null);
      setConfirmEndStream(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    const stream = confirmDeleteStream;
    setBusyId(stream.id);
    setError("");
    try {
      await deleteMyLiveStream(stream.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete live stream.");
    } finally {
      setBusyId(null);
      setConfirmDeleteStream(null);
    }
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
              <Radio className="h-5 w-5" style={{ color: COLORS.gold }} /> My Live Events
            </h1>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              Point OBS or similar broadcast software at the RTMP URL + Stream Key to go live.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((s) => !s)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>

        {showCreateForm && (
          <div className="mb-6 rounded-xl p-5" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.2)" }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="mb-3 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            >
              <option value="play" style={{ background: COLORS.black }}>Play</option>
              <option value="archive" style={{ background: COLORS.black }}>Archive</option>
              <option value="both" style={{ background: COLORS.black }}>Both</option>
            </select>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        )}

        {justCreated && (
          <div className="mb-6 rounded-xl p-5" style={{ background: "rgba(111,207,151,0.08)", border: "1px solid rgba(111,207,151,0.3)" }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: "#6FCF97" }}>
              "{justCreated.title}" created — broadcast details below (also viewable anytime in the list).
            </p>
            <CopyableField label="RTMP URL" value={justCreated.rtmp_url} />
            <CopyableField label="Stream Key" value={justCreated.stream_key} secret />
            <button type="button" onClick={() => setJustCreated(null)} className="mt-2 text-xs underline" style={{ color: "rgba(245,235,221,0.5)" }}>
              Dismiss
            </button>
          </div>
        )}

        {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : streams.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No live events yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {streams.map((s) => {
              const style = STATUS_STYLES[s.status] || STATUS_STYLES.idle;
              return (
                <div key={s.id} className="rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{s.title}</p>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: style.bg, color: style.color }}>
                      {s.status}
                    </span>
                  </div>
                  <CopyableField label="RTMP URL" value={s.rtmp_url} />
                  <CopyableField label="Stream Key" value={s.stream_key} secret />
                  <CopyableField label="Playback URL" value={s.playback_url} />

                  {s.status === "idle" && (
                    <p className="mt-2 text-xs" style={{ color: "rgba(111,207,151,0.9)" }}>
                      Ready to broadcast — point OBS (or similar) at the RTMP URL + Stream Key above and press
                      Start Streaming there any time. No need to create a new event.
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    {s.status === "active" && (
                      <button
                        type="button"
                        onClick={() => setConfirmEndStream(s)}
                        disabled={busyId === s.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                      >
                        <Square className="h-3.5 w-3.5" /> End for now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteStream(s)}
                      disabled={busyId === s.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete permanently
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmEndStream}
        title="End for now"
        message={`Mark "${confirmEndStream?.title}" as not currently live? Your RTMP URL and Stream Key stay valid — you can go live again with the same details any time.`}
        confirmLabel="End for now"
        danger
        busy={busyId === confirmEndStream?.id}
        onCancel={() => setConfirmEndStream(null)}
        onConfirm={handleEndConfirmed}
      />

      <ConfirmDialog
        open={!!confirmDeleteStream}
        title="Delete live event"
        message={`Permanently delete "${confirmDeleteStream?.title}"? This destroys the RTMP URL + Stream Key — they'll stop working and this can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDeleteStream?.id}
        onCancel={() => setConfirmDeleteStream(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
