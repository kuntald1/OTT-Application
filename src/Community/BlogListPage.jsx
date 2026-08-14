import React from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { BLOG_POSTS } from "./blogData";
import { useApp } from "../context/AppContext";

export default function BlogListPage({ onBack, onOpenPost, onNavigate }) {
  const { isLoggedIn, isSubscribed, requestLogin } = useApp();

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
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{BLOG_POSTS.length} posts</p>

        <div className="grid gap-5 sm:grid-cols-2">
          {BLOG_POSTS.map((post) => (
            <article
              key={post.id}
              className="rounded-2xl p-6"
              style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{post.date}</p>
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
      </main>
    </div>
  );
}
