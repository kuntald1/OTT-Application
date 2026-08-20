import React, { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchCommunityRoom, createRoomPost, createPostReply } from "../api";

// ---------------------------------------------------------------------------
// Individual Community Room — text-only posting and replying (image/video
// attachment, Share, and Like/React remain out of scope here, matching the
// existing simplified UX). Posts and replies are now persisted to the
// backend instead of living only in local browser state.
// ---------------------------------------------------------------------------

export default function CommunityRoomPage({ roomId, onBack, onNavigate }) {
  const { isLoggedIn, isSubscribed, requestLogin } = useApp();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const [openReplyFor, setOpenReplyFor] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const loadRoom = () => {
    setLoading(true);
    fetchCommunityRoom(roomId)
      .then((data) => {
        setRoom(data);
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const requireLogin = (fn) => (...args) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!isSubscribed) {
      onNavigate?.("subscription");
      return;
    }
    fn(...args);
  };

  const handlePost = requireLogin(async () => {
    if (!text.trim()) return;
    setPostError("");
    setPosting(true);
    try {
      await createRoomPost(roomId, text.trim());
      setText("");
      loadRoom();
    } catch (err) {
      setPostError(err.message || "Couldn't post. Please try again.");
    } finally {
      setPosting(false);
    }
  });

  const handleReplySubmit = requireLogin(async (postId) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      await createPostReply(roomId, postId, replyText.trim());
      setReplyText("");
      setOpenReplyFor(null);
      loadRoom();
    } catch (err) {
      setPostError(err.message || "Couldn't reply. Please try again.");
    } finally {
      setReplying(false);
    }
  });

  if (loading) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !room) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>Room not found.</p>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>{room.title}</h1>
        <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Started by {room.created_by_name}</p>

        {/* Composer */}
        <div className="mb-8 rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share a thought, review, or question…"
            className="w-full resize-none rounded-lg border px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          {postError && (
            <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{postError}</p>
          )}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={handlePost}
              disabled={!text.trim() || posting}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Send className="h-3.5 w-3.5" /> {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>

        {/* Posts */}
        <div className="flex flex-col gap-4">
          {room.posts.length === 0 && (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No posts yet — be the first to share something.</p>
          )}
          {room.posts.map((post) => (
            <div key={post.id} className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{post.author_name}</p>
              {post.text && <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.8)" }}>{post.text}</p>}

              <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
                <button type="button" onClick={() => setOpenReplyFor(openReplyFor === post.id ? null : post.id)} className="flex items-center gap-1 hover:opacity-80">
                  <MessageSquare className="h-3.5 w-3.5" /> {post.replies.length} {post.replies.length === 1 ? "reply" : "replies"}
                </button>
              </div>

              {post.replies.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  {post.replies.map((r) => (
                    <p key={r.id} className="text-xs" style={{ color: "rgba(245,235,221,0.65)" }}>
                      <span className="font-semibold" style={{ color: COLORS.gold }}>{r.author_name}: </span>{r.text}
                    </p>
                  ))}
                </div>
              )}

              {openReplyFor === post.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply…"
                    className="flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
                    style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                  />
                  <button
                    type="button"
                    onClick={() => handleReplySubmit(post.id)}
                    disabled={!replyText.trim() || replying}
                    className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
                    style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                  >
                    {replying ? "…" : "Reply"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
