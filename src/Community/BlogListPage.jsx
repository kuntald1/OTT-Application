import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Heart, MessageCircle, Pencil, PenLine } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { fetchBlogs, fetchMyBlogs } from "../api";
import { useApp } from "../context/AppContext";
import SearchBox from "../shared/SearchBox";
import CreateBlogModal from "./CreateBlogModal";

// How a submission reads to its author while it waits or after a
// decision. Colour carries the same meaning as everywhere else in the
// admin panel: gold = waiting on us, green = live, red = turned down.
const STATUS_BADGE = {
  pending: { label: "Awaiting review", color: COLORS.gold, bg: "rgba(212,175,55,0.14)" },
  published: { label: "Published", color: "#6FCF97", bg: "rgba(111,207,151,0.14)" },
  rejected: { label: "Not published", color: "#f87171", bg: "rgba(248,113,113,0.14)" },
};

export default function BlogListPage({ onBack, onOpenPost, onNavigate, startWriting = false }) {
  const { isLoggedIn, isSubscribed, requestLogin } = useApp();
  const [posts, setPosts] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // null = closed, "new" = writing a fresh post, a post object = editing
  // that draft. One piece of state, because the two can't both be open.
  // Starts open when the Community page's Create Blog sent them here,
  // so arriving doesn't mean hunting for the button again.
  const [editorFor, setEditorFor] = useState(startWriting ? "new" : null);

  const loadMine = () => {
    if (!isLoggedIn) {
      setMine([]);
      return;
    }
    fetchMyBlogs().then(setMine).catch(() => setMine([]));
  };

  useEffect(() => {
    fetchBlogs()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadMine, [isLoggedIn]);

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

  const handleWrite = () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setEditorFor("new");
  };

  // Searching the summary and the author as well as the title, because
  // "that piece by Sujoy" is how people actually look for a post.
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? posts.filter((p) =>
            [p.title, p.excerpt, p.author_name].some((f) => (f || "").toLowerCase().includes(needle))
          )
        : posts,
    [posts, needle]
  );

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

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Blog</h1>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              {loading
                ? "Loading…"
                : needle
                ? `${filtered.length} of ${posts.length} posts`
                : `${posts.length} posts`}
            </p>
          </div>
          {/* Anyone with an account can write. The editors decide what
              goes up — see CreateBlogModal, which says so before and
              after writing. */}
          <button
            type="button"
            onClick={handleWrite}
            className="flex flex-shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <PenLine className="h-4 w-4" /> Create Blog
          </button>
        </div>

        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search posts"
          className="mb-8 max-w-md"
        />

        {/* The author's own submissions, above the public list, because
            somebody who has just written one comes back to this page to
            find out what happened to it. Only shown when they have
            something waiting or turned down — a published post of
            theirs is already in the list below. */}
        {mine.some((p) => p.status !== "published") && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold" style={{ color: COLORS.cream }}>Your posts</h2>
            <div className="flex flex-col gap-3">
              {mine
                .filter((p) => p.status !== "published")
                .map((post) => {
                  const badge = STATUS_BADGE[post.status] || STATUS_BADGE.pending;
                  return (
                    <div
                      key={post.id}
                      className="rounded-xl px-5 py-4"
                      style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                          {formatDate(post.published_at)}
                        </span>
                      </div>
                      <p className="mt-2 font-semibold" style={{ color: COLORS.cream }}>{post.title}</p>
                      <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{post.excerpt}</p>
                      {post.status === "rejected" && post.review_note && (
                        <p className="mt-3 text-sm" style={{ color: "#f87171" }}>
                          <b>What needs changing:</b> {post.review_note}
                        </p>
                      )}
                      {/* Editable right up until an editor publishes it.
                          On a rejected post this is the whole point of
                          the reason above — saving sends it back for
                          review. */}
                      <button
                        type="button"
                        onClick={() => setEditorFor(post)}
                        className="mt-3 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                        style={{ color: COLORS.gold }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {post.status === "rejected" ? "Edit and resubmit" : "Edit post"}
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {!loading && filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            {needle ? `No post matches "${query.trim()}".` : "No posts published yet."}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {filtered.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden rounded-2xl"
                style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
              >
                {post.cover_image_url && (
                  <img src={post.cover_image_url} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="p-6">
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>{formatDate(post.published_at)}</p>
                  <h2 className="mt-2 text-lg font-semibold leading-snug" style={{ color: COLORS.cream }}>{post.title}</h2>
                  <p className="mt-1 text-xs" style={{ color: COLORS.gold }}>{post.author_name}</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.65)" }}>{post.excerpt}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                    <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {post.likes_count || 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {post.comment_count || 0}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReadMore(post.id)}
                    className="mt-4 text-sm font-medium hover:opacity-80"
                    style={{ color: COLORS.gold }}
                  >
                    Read more →
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {editorFor && (
        <CreateBlogModal
          // Remounted per draft: the modal reads its initial fields from
          // this prop, so a key change is what resets them when the
          // person closes one draft and opens another.
          key={editorFor === "new" ? "new" : editorFor.id}
          post={editorFor === "new" ? null : editorFor}
          onClose={() => setEditorFor(null)}
          // Refresh "Your posts" so the change is there the moment the
          // dialog closes, rather than after a reload.
          onSubmitted={loadMine}
        />
      )}
    </div>
  );
}
