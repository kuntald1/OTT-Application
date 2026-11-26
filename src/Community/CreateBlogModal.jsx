import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { submitBlog, updateMyBlog, uploadMyBlogCover, fetchBlogPost } from "../api";

// Writing a post, and revising one. What a member submits here does
// NOT go live — it joins the admin review queue, and the admins are
// messaged the moment it lands.
//
// The form says so twice: once before they write and once after they
// send. Somebody who expects to see their words on the site in a
// minute and doesn't would reasonably conclude it failed.
//
// Pass `post` to edit an existing draft instead of starting a new one.
// Only a post that is NOT yet published can be edited, and the server
// enforces that too — this component only decides what to show.
const MAX_EXCERPT = 500;
const MAX_COVER_MB = 5;
const ACCEPTED_COVER = "image/jpeg,image/png,image/webp";

export default function CreateBlogModal({ post = null, onClose, onSubmitted }) {
  const editing = !!post;
  const [title, setTitle] = useState(post?.title || "");
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [body, setBody] = useState("");
  // The list the editor opens from carries no body, so fetch it. Until
  // it arrives the body box is disabled rather than showing an empty
  // field somebody might type into and overwrite their own draft with.
  const [loadingBody, setLoadingBody] = useState(editing);
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url || null);
  const [coverFile, setCoverFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetchBlogPost(post.id)
      .then((full) => {
        if (!cancelled) setBody(full.body || "");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your draft. Close and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, post?.id]);

  const canSubmit = title.trim() && excerpt.trim() && body.trim() && !saving && !loadingBody;

  const handlePickCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file twice still fires
    if (!file) return;
    if (!ACCEPTED_COVER.split(",").includes(file.type)) {
      setError("Cover must be a JPEG, PNG or WEBP image.");
      return;
    }
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      setError(`Cover must be smaller than ${MAX_COVER_MB}MB.`);
      return;
    }
    setError("");
    setCoverFile(file);
    // Shown straight away from the local file — the real upload only
    // happens on send, because a cover needs a post to belong to.
    setCoverUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const fields = { title: title.trim(), excerpt: excerpt.trim(), body: body.trim() };
      const saved = editing ? await updateMyBlog(post.id, fields) : await submitBlog(fields);
      // Cover second: it needs the post's id, and a failed image must
      // not lose the writing. If this throws, the post is already
      // saved and the message below says exactly that.
      if (coverFile) {
        try {
          await uploadMyBlogCover(saved.id, coverFile);
        } catch {
          setError("Your post was sent, but the cover image didn't upload. You can add it by editing the post.");
        }
      }
      setDone(true);
      onSubmitted?.(saved);
    } catch (err) {
      setError(err.message || "Couldn't send your post. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    borderColor: "rgba(245,235,221,0.15)",
    background: "rgba(245,235,221,0.05)",
    color: COLORS.cream,
  };
  const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide";
  const labelStyle = { color: "rgba(245,235,221,0.5)" };

  return (
    // Scrollable overlay with the card centred only while it fits — the
    // body field makes this form tall, and a dead-centred card in a
    // fixed layer gets clipped at both ends on a laptop.
    <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: "rgba(10,1,4,0.82)" }}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="w-full max-w-2xl rounded-2xl p-6 sm:p-7"
          style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}
        >
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold" style={{ color: COLORS.cream }}>
              {done ? "Sent for review" : editing ? "Edit your post" : "Write a blog post"}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="hover:opacity-80">
              <X className="h-5 w-5" style={{ color: "rgba(245,235,221,0.6)" }} />
            </button>
          </div>

          {done ? (
            <>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.7)" }}>
                Thank you — your post has gone to the theomy editors. They have been notified and
                will publish it or write back with what needs changing. You'll get a WhatsApp and
                an email either way.
              </p>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.7)" }}>
                Until then it sits under <b>Your posts</b> on the Blog page, where you can read it
                back and keep editing it.
              </p>
              {error && (
                <p className="mt-3 text-sm" style={{ color: "#f87171" }}>{error}</p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
                {editing
                  ? "You can keep changing this until an editor publishes it. Saving a post that was turned down sends it back for review."
                  : "An editor reads every post before it goes on the site. Yours will appear once it's approved — we'll message you either way."}
              </p>

              {/* Cover first: it is the one field people forget exists
                  if it sits under a long body box. */}
              <div className="mb-5">
                <span className={labelClass} style={labelStyle}>Cover image</span>
                <div className="flex flex-wrap items-center gap-4">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Cover preview"
                      className="h-20 w-32 rounded-lg object-cover"
                      style={{ border: "1px solid rgba(212,175,55,0.3)" }}
                    />
                  ) : (
                    <div
                      className="flex h-20 w-32 items-center justify-center rounded-lg text-[11px]"
                      style={{ border: "1px dashed rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.35)" }}
                    >
                      No cover
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                      style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                    >
                      <ImagePlus className="h-4 w-4" />
                      {coverUrl ? "Change cover image" : "Add cover image"}
                    </button>
                    <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.35)" }}>
                      Optional · JPEG, PNG or WEBP · up to {MAX_COVER_MB}MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_COVER}
                    onChange={handlePickCover}
                    className="hidden"
                  />
                </div>
              </div>

              <label className="mb-4 block">
                <span className={labelClass} style={labelStyle}>Title</span>
                <input
                  type="text"
                  value={title}
                  maxLength={255}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What is the post about?"
                  className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </label>

              <label className="mb-4 block">
                <span className={labelClass} style={labelStyle}>Short summary</span>
                <textarea
                  value={excerpt}
                  maxLength={MAX_EXCERPT}
                  rows={2}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="One or two sentences — this is what people see in the list."
                  className="w-full resize-y rounded-lg border px-4 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
                <span className="mt-1 block text-right text-[11px]" style={{ color: "rgba(245,235,221,0.35)" }}>
                  {excerpt.length}/{MAX_EXCERPT}
                </span>
              </label>

              <label className="mb-2 block">
                <span className={labelClass} style={labelStyle}>The post</span>
                <textarea
                  value={body}
                  rows={12}
                  disabled={loadingBody}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={loadingBody ? "Loading your draft…" : "Write it here. Leave a blank line between paragraphs."}
                  className="w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed outline-none disabled:opacity-50"
                  style={inputStyle}
                />
              </label>

              {error && (
                <div
                  className="mb-4 rounded-lg px-3 py-2 text-sm font-medium"
                  style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                >
                  {error}
                </div>
              )}

              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                >
                  {saving ? "Sending…" : editing ? "Save and send for review" : "Send for review"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm font-medium hover:opacity-80"
                  style={{ color: "rgba(245,235,221,0.55)" }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
