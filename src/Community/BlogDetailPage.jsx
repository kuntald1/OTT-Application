import React, { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Facebook, Instagram, Heart, Send, Trash2 } from "lucide-react";
import { COLORS } from "../theme";
import { fetchBlogPost, toggleBlogLike, fetchBlogComments, addBlogComment, deleteBlogComment } from "../api";
import { useApp } from "../context/AppContext";
import ConfirmDialog from "../shared/ConfirmDialog";

export default function BlogDetailPage({ postId, onBack }) {
  const { isLoggedIn, requestLogin, profile } = useApp();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState(null);
  const [instagramCopied, setInstagramCopied] = useState(false);

  const load = () => {
    setLoading(true);
    setNotFound(false);
    fetchBlogPost(postId)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    fetchBlogComments(postId).then(setComments).catch(() => setComments([]));
  };

  useEffect(load, [postId]);

  const handleLike = async () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    try {
      const result = await toggleBlogLike(postId);
      setPost((p) => ({ ...p, liked_by_me: result.liked, likes_count: result.likes_count }));
    } catch (err) {
      // best-effort — like is low-stakes, silently ignore a transient failure
    }
  };

  const handlePostComment = async () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!commentText.trim()) return;
    setPostingComment(true);
    try {
      await addBlogComment(postId, commentText.trim());
      setCommentText("");
      const fresh = await fetchBlogComments(postId);
      setComments(fresh);
      setPost((p) => ({ ...p, comment_count: fresh.length }));
    } catch (err) {
      // best-effort
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteCommentConfirmed = async () => {
    try {
      await deleteBlogComment(postId, confirmDeleteComment.id);
      const fresh = await fetchBlogComments(postId);
      setComments(fresh);
      setPost((p) => ({ ...p, comment_count: fresh.length }));
    } catch (err) {
      // best-effort
    } finally {
      setConfirmDeleteComment(null);
    }
  };

  const handleInstagramShare = async () => {
    // Instagram has no public web share-intent like WhatsApp/Facebook do —
    // sharing directly to a Story requires their native mobile SDK with a
    // registered Meta App ID, which theomy doesn't have configured. This
    // copies the link so the person can paste it into their Story manually,
    // which is the honest, actually-working fallback rather than a broken
    // deep link.
    try {
      await navigator.clipboard.writeText(window.location.href);
      setInstagramCopied(true);
      setTimeout(() => setInstagramCopied(false), 2500);
    } catch (err) {
      // clipboard API unavailable — nothing more we can do here
    }
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  if (loading) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>Post not found.</p>
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

        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt=""
            className="mb-6 w-full rounded-xl object-cover"
            style={{ maxHeight: 360 }}
          />
        )}

        <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{formatDate(post.published_at)} · {post.author_name}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: COLORS.cream }}>{post.title}</h1>

        <div className="mt-6 flex flex-col gap-4">
          {post.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>{para}</p>
          ))}
        </div>

        {/* Like */}
        <div className="mt-8 flex items-center gap-4 border-t pt-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button
            type="button"
            onClick={handleLike}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold hover:opacity-80"
            style={{
              background: post.liked_by_me ? "rgba(248,113,113,0.15)" : "rgba(245,235,221,0.06)",
              color: post.liked_by_me ? "#f87171" : "rgba(245,235,221,0.7)",
            }}
          >
            <Heart className="h-4 w-4" fill={post.liked_by_me ? "#f87171" : "none"} />
            {post.likes_count} {post.likes_count === 1 ? "Like" : "Likes"}
          </button>
          <span className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
            {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
          </span>
        </div>

        {/* Share */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Share:</span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${post.title} — ${window.location.href}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
            style={{ background: "rgba(37,211,102,0.12)", color: "#25D366", border: "1px solid rgba(37,211,102,0.3)" }}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
            style={{ background: "rgba(24,119,242,0.12)", color: "#1877F2", border: "1px solid rgba(24,119,242,0.3)" }}
          >
            <Facebook className="h-3.5 w-3.5" /> Facebook
          </a>
          <button
            type="button"
            onClick={handleInstagramShare}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
            style={{ background: "rgba(225,48,108,0.12)", color: "#E1306C", border: "1px solid rgba(225,48,108,0.3)" }}
          >
            <Instagram className="h-3.5 w-3.5" /> {instagramCopied ? "Link copied!" : "Instagram"}
          </button>
        </div>
        {instagramCopied && (
          <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
            Link copied — paste it into your Instagram Story.
          </p>
        )}

        {/* Comments */}
        <div className="mt-10 border-t pt-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 className="mb-4 text-sm font-semibold" style={{ color: COLORS.cream }}>Comments</h2>

          <div className="mb-6 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isLoggedIn ? "Add a comment…" : "Log in to comment"}
              onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <button
              type="button"
              onClick={handlePostComment}
              disabled={postingComment}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              <Send className="h-3.5 w-3.5" /> Post
            </button>
          </div>

          {comments.length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>No comments yet — be the first.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: COLORS.cream }}>{c.user_name}</p>
                    <p className="text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>{c.content}</p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.35)" }}>{formatDate(c.created_at)}</p>
                  </div>
                  {isLoggedIn && profile?.id === c.user_id && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteComment(c)}
                      className="flex-shrink-0 rounded-lg p-1.5 hover:bg-white/5"
                      style={{ color: "#f87171" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!confirmDeleteComment}
        title="Delete comment"
        message="Delete your comment? This can't be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteComment(null)}
        onConfirm={handleDeleteCommentConfirmed}
      />
    </div>
  );
}
