import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { fetchBlogs } from "../api";
import { useApp } from "../context/AppContext";

export default function BlogListPage({ onBack, onOpenPost, onNavigate }) {
  const { isLoggedIn, isSubscribed, requestLogin } = useApp();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBlogs()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleReadMore = (postId) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!isSubscribed) {
      onNavigate?.("subscription");
      return;
    }
    onOpenPost(postId);
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-4xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Blog</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          {loading ? "Loading…" : `${posts.length} posts`}
        </p>

        {!loading && posts.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No posts published yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-2xl p-6"
                style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
              >
                <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{formatDate(post.published_at)}</p>
                <h2 className="mt-2 text-lg font-semibold leading-snug" style={{ color: COLORS.cream }}>{post.title}</h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.65)" }}>{post.excerpt}</p>
                <button
                  type="button"
                  onClick={() => handleReadMore(post.id)}
                  className="mt-4 text-sm font-medium hover:opacity-80"
                  style={{ color: COLORS.gold }}
                >
                  Read more →
                </button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
