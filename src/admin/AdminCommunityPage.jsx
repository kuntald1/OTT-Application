import React, { useEffect, useState } from "react";
import { MessagesSquare, Plus, Trash2, ArrowLeft, ImagePlus, Send } from "lucide-react";
import { fetchCommunityRooms, fetchCommunityRoom } from "../api";
import {
  createAdminCommunityRoom, createAdminRoomPost, deleteAdminRoomPost, deleteAdminCommunityRoom,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};

export default function AdminCommunityPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [openRoomId, setOpenRoomId] = useState(null);
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(null);
  const [busyRoomId, setBusyRoomId] = useState(null);

  const load = () => {
    setLoading(true);
    fetchCommunityRooms()
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setError("");
    setCreating(true);
    try {
      await createAdminCommunityRoom(newTitle.trim());
      setNewTitle("");
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create room.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoomConfirmed = async () => {
    setBusyRoomId(confirmDeleteRoom.id);
    setError("");
    try {
      await deleteAdminCommunityRoom(confirmDeleteRoom.id);
      if (openRoomId === confirmDeleteRoom.id) setOpenRoomId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete room.");
    } finally {
      setBusyRoomId(null);
      setConfirmDeleteRoom(null);
    }
  };

  if (openRoomId) {
    return (
      <RoomDetail
        roomId={openRoomId}
        onBack={() => { setOpenRoomId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
            <MessagesSquare className="h-5 w-5" style={{ color: COLORS.gold }} /> Community
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            Rooms for discussion. Admin can create rooms, comment in any room, and moderate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> New Room
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-5 flex gap-2 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <input type="text" placeholder="Room title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={inputStyle} />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newTitle.trim()}
            className="flex-shrink-0 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: COLORS.gold, color: "#0a0104" }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : rooms.length === 0 ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>No rooms yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <button type="button" onClick={() => setOpenRoomId(r.id)} className="flex-1 text-left">
                <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{r.title}</p>
                <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                  {r.created_by_name}{r.is_admin_created && " (Admin)"} · {r.post_count} comment{r.post_count === 1 ? "" : "s"}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteRoom(r)}
                disabled={busyRoomId === r.id}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteRoom}
        title="Delete room"
        message={`Permanently delete "${confirmDeleteRoom?.title}"? All comments in it go with it. This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={busyRoomId === confirmDeleteRoom?.id}
        onCancel={() => setConfirmDeleteRoom(null)}
        onConfirm={handleDeleteRoomConfirmed}
      />
    </div>
  );
}

function RoomDetail({ roomId, onBack }) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = useState(null);
  const [busyPostId, setBusyPostId] = useState(null);

  const load = () => {
    setLoading(true);
    fetchCommunityRoom(roomId)
      .then(setRoom)
      .catch(() => setRoom(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [roomId]);

  const handlePost = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    setError("");
    try {
      await createAdminRoomPost(roomId, commentText.trim(), commentImage);
      setCommentText("");
      setCommentImage(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't post comment.");
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePostConfirmed = async () => {
    setBusyPostId(confirmDeletePost.id);
    setError("");
    try {
      await deleteAdminRoomPost(roomId, confirmDeletePost.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete comment.");
    } finally {
      setBusyPostId(null);
      setConfirmDeletePost(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
        <ArrowLeft className="h-4 w-4" /> Back to Community
      </button>

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : !room ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Room not found.</p>
      ) : (
        <>
          <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>{room.title}</h1>
          <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            {room.created_by_name}{room.is_admin_created && " (Admin)"} · {room.posts.length} comment{room.posts.length === 1 ? "" : "s"}
          </p>

          {error && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
              {error}
            </div>
          )}

          <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.2)" }}>
            <textarea
              rows={2}
              placeholder="Comment as admin…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div className="mt-2 flex items-center justify-between">
              <label
                className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {commentImage ? commentImage.name : "Add image (optional)"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => setCommentImage(e.target.files?.[0] || null)} />
              </label>
              <button
                type="button"
                onClick={handlePost}
                disabled={posting || !commentText.trim()}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#0a0104" }}
              >
                <Send className="h-3.5 w-3.5" /> {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>

          {room.posts.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.4)" }}>No comments yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {room.posts.map((p) => (
                <div key={p.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: COLORS.gold }}>
                        {p.author_name}
                        {p.is_admin && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}>
                            Admin
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.85)" }}>{p.text}</p>
                      {p.image_url && <img src={p.image_url} alt="" className="mt-2 max-h-48 rounded-lg" />}
                      <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                        {formatDate(p.created_at)} · {p.likes_count} like{p.likes_count === 1 ? "" : "s"} · {p.replies.length} repl{p.replies.length === 1 ? "y" : "ies"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePost(p)}
                      disabled={busyPostId === p.id}
                      className="flex-shrink-0 rounded-lg p-1.5 hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "#f87171" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDeletePost}
        title="Delete comment"
        message="Permanently delete this comment (and any replies to it)? This can't be undone."
        confirmLabel="Delete"
        danger
        busy={busyPostId === confirmDeletePost?.id}
        onCancel={() => setConfirmDeletePost(null)}
        onConfirm={handleDeletePostConfirmed}
      />
    </div>
  );
}
