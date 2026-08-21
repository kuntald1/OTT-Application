import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchCommunityRoom, createRoomPost, createPostReply } from "../api";

// ---------------------------------------------------------------------------
// Community Room — styled as a chat, not a feed of posts. Messages from
// the logged-in user align right with a gold bubble (WhatsApp's "your
// message" convention); everyone else's align left with a neutral bubble
// and their name shown above it. A fixed composer sits at the bottom of
// the screen. Replies are shown as smaller, indented follow-up bubbles
// directly under the message they belong to, so a conversation still
// reads top-to-bottom like a chat thread even though the data underneath
// is still "posts with replies," not a fully flat message stream.
// ---------------------------------------------------------------------------

export default function CommunityRoomPage({ roomId, onBack, onNavigate }) {
  const { isLoggedIn, isSubscribed, requestLogin, profile } = useApp();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const bottomRef = useRef(null);

  const loadRoom = () => {
    setLoading(true);
    fetchCommunityRoom(roomId)
      .then((data) => {
        // Oldest first, so the chat reads top-to-bottom like a real
        // conversation — the API returns newest-first.
        setRoom({ ...data, posts: [...data.posts].reverse() });
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.posts?.length]);

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

  const handleSend = requireLogin(async () => {
    if (!text.trim()) return;
    setError("");
    setPosting(true);
    try {
      await createRoomPost(roomId, text.trim());
      setText("");
      loadRoom();
    } catch (err) {
      setError(err.message || "Couldn't send. Please try again.");
    } finally {
      setPosting(false);
    }
  });

  const handleSendReply = requireLogin(async (postId) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      await createPostReply(roomId, postId, replyText.trim());
      setReplyText("");
      setReplyingTo(null);
      loadRoom();
    } catch (err) {
      setError(err.message || "Couldn't reply. Please try again.");
    } finally {
      setReplying(false);
    }
  });

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif" }} className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pb-4 pt-24 sm:px-10 sm:pt-28" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-xl font-semibold" style={{ color: COLORS.cream }}>{room.title}</h1>
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Started by {room.created_by_name}</p>
      </div>

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {room.posts.length === 0 && (
            <p className="text-center text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No messages yet — say something to get the conversation started.</p>
          )}
          {room.posts.map((post) => {
            const isMine = post.author_user_id === profile.id;
            return (
              <div key={post.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                {!isMine && (
                  <span className="mb-0.5 ml-3 text-xs font-medium" style={{ color: COLORS.gold }}>{post.author_name}</span>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
                  style={
                    isMine
                      ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR, borderBottomRightRadius: 4 }
                      : { background: COLORS.blackSoft, color: "rgba(245,235,221,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 }
                  }
                >
                  {post.text}
                  <div className="mt-1 text-right text-[10px] opacity-60">{formatTime(post.created_at)}</div>
                </div>

                {/* Replies — smaller, indented follow-up bubbles */}
                {post.replies.map((r) => {
                  const replyIsMine = r.author_user_id === profile.id;
                  return (
                    <div key={r.id} className={`mt-1.5 flex flex-col ${replyIsMine ? "items-end" : "items-start"} ${isMine ? "mr-2" : "ml-6"}`}>
                      {!replyIsMine && (
                        <span className="mb-0.5 text-[11px] font-medium" style={{ color: "rgba(212,175,55,0.7)" }}>{r.author_name}</span>
                      )}
                      <div
                        className="max-w-[75%] rounded-xl px-3 py-2 text-xs"
                        style={
                          replyIsMine
                            ? { background: "rgba(212,175,55,0.35)", color: COLORS.cream }
                            : { background: "rgba(255,255,255,0.05)", color: "rgba(245,235,221,0.8)", border: "1px solid rgba(255,255,255,0.06)" }
                        }
                      >
                        {r.text}
                      </div>
                    </div>
                  );
                })}

                {/* Reply trigger / inline reply box */}
                {replyingTo === post.id ? (
                  <div className={`mt-1.5 flex w-full max-w-[80%] gap-2 ${isMine ? "justify-end" : ""}`}>
                    <input
                      type="text"
                      autoFocus
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendReply(post.id)}
                      placeholder="Reply…"
                      className="flex-1 rounded-full border px-3 py-1.5 text-xs outline-none"
                      style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSendReply(post.id)}
                      disabled={!replyText.trim() || replying}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                      style={{ background: CTA_GRADIENT }}
                    >
                      <Send className="h-3 w-3" style={{ color: CTA_TEXT_COLOR }} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setReplyingTo(post.id); setReplyText(""); }}
                    className="mt-1 text-[11px] hover:opacity-80"
                    style={{ color: "rgba(245,235,221,0.4)" }}
                  >
                    Reply
                  </button>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <p className="flex-shrink-0 px-6 pb-1 text-center text-xs font-medium sm:px-10" style={{ color: "#f87171" }}>{error}</p>
      )}

      {/* Composer — fixed at the bottom */}
      <div className="flex-shrink-0 border-t px-4 py-3 sm:px-10" style={{ borderColor: "rgba(255,255,255,0.08)", background: COLORS.blackSoft }}>
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message…"
            className="flex-1 rounded-full border px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || posting}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT }}
          >
            <Send className="h-4 w-4" style={{ color: CTA_TEXT_COLOR }} />
          </button>
        </div>
      </div>
    </div>
  );
}
