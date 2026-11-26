import React, { useState } from "react";
import { X } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { submitBlog } from "../api";

// Writing a post, from the main site. What a member submits here does
// NOT go live — it joins the admin review queue, and the admins are
// messaged about it the moment it lands.
//
// The form says so twice: once before they write and once after they
// submit. Somebody who expects to see their words on the site in a
// minute and doesn't would reasonably conclude it failed.
const MAX_EXCERPT = 500;

export default function CreateBlogModal({ onClose, onSubmitted }) {
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = title.trim() && excerpt.trim() && body.trim() && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const post = await submitBlog({
        title: title.trim(),
        excerpt: excerpt.trim(),
        body: body.trim(),
      });
      setDone(true);
      onSubmitted?.(post);
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
              {done ? "Sent for review" : "Write a blog post"}
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
                back.
              </p>
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
                An editor reads every post before it goes on the site. Yours will appear once it's
                approved — we'll message you either way.
              </p>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  Title
                </span>
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
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  Short summary
                </span>
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
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                  The post
                </span>
                <textarea
                  value={body}
                  rows={12}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write it here. Leave a blank line between paragraphs."
                  className="w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed outline-none"
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
                  {saving ? "Sending…" : "Send for review"}
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
