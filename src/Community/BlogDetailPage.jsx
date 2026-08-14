import React from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { getBlogPost } from "./blogData";

export default function BlogDetailPage({ postId, onBack }) {
  const post = getBlogPost(postId);

  if (!post) {
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

        <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{post.date}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: COLORS.cream }}>{post.title}</h1>

        <div className="mt-6 flex flex-col gap-4">
          {post.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>{para}</p>
          ))}
        </div>
      </main>
    </div>
  );
}
