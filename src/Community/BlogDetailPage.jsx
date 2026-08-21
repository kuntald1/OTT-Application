import React, { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Facebook } from "lucide-react";
import { COLORS } from "../theme";
import { fetchBlogPost } from "../api";

export default function BlogDetailPage({ postId, onBack }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetchBlogPost(postId)
      .then(setPost)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [postId]);

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

        <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{formatDate(post.published_at)} · {post.author_name}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: COLORS.cream }}>{post.title}</h1>

        <div className="mt-6 flex flex-col gap-4">
          {post.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>{para}</p>
          ))}
        </div>

        {/* Share */}
        <div className="mt-10 flex items-center gap-3 border-t pt-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
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
        </div>
      </main>
    </div>
  );
}
