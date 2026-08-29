import React, { useEffect, useState } from "react";
import { Newspaper, Plus, Pencil, Trash2, ImagePlus, Eye, EyeOff, MessageSquare } from "lucide-react";
import {
  createAdminBlog, fetchAdminBlogs, updateAdminBlog, deleteAdminBlog, uploadAdminBlogCover,
  fetchAllAdminBlogComments, editAdminBlogComment, deleteAdminBlogComment,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";
import FilePreview from "../shared/FilePreview";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function AdminBlogsPage() {
  const [posts, setPosts] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("theomy Team");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", excerpt: "", body: "", author_name: "" });
  const [saving, setSaving] = useState(false);

  const [uploadingCoverFor, setUploadingCoverFor] = useState(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(null);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState(null);

  const [expandedComments, setExpandedComments] = useState(null); // blog id whose comments are shown
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdminBlogs(), fetchAllAdminBlogComments()])
      .then(([p, c]) => { setPosts(p); setAllComments(c); })
      .catch(() => { setPosts([]); setAllComments([]); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!title.trim() || !excerpt.trim() || !body.trim()) return;
    setError("");
    setCreating(true);
    try {
      await createAdminBlog(title.trim(), excerpt.trim(), body.trim(), authorName.trim(), true);
      setTitle(""); setExcerpt(""); setBody(""); setAuthorName("theomy Team");
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create post.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (post) => {
    setEditingId(post.id);
    setEditForm({ title: post.title, excerpt: post.excerpt, body: post.body || "", author_name: post.author_name });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateAdminBlog(editingId, editForm);
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setEditingId(null);
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (post) => {
    setBusyId(post.id);
    try {
      await updateAdminBlog(post.id, { is_published: !post.is_published });
      load();
    } catch (err) {
      setError(err.message || "Couldn't update.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCoverSelect = async (postId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCoverFor(postId);
    setError("");
    try {
      const updated = await uploadAdminBlogCover(postId, file);
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    } catch (err) {
      setError(err.message || "Couldn't upload cover image.");
    } finally {
      setUploadingCoverFor(null);
    }
  };

  const handleDeletePostConfirmed = async () => {
    setBusyId(confirmDeletePost.id);
    try {
      await deleteAdminBlog(confirmDeletePost.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete post.");
    } finally {
      setBusyId(null);
      setConfirmDeletePost(null);
    }
  };

  const openEditComment = (c) => {
    setEditingCommentId(c.id);
    setEditCommentText(c.content);
  };

  const handleSaveCommentEdit = async () => {
    if (!editCommentText.trim()) return;
    setSavingComment(true);
    setError("");
    try {
      await editAdminBlogComment(editingCommentId, editCommentText.trim());
      setEditingCommentId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteCommentConfirmed = async () => {
    setBusyId(confirmDeleteComment.id);
    try {
      await deleteAdminBlogComment(confirmDeleteComment.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete comment.");
    } finally {
      setBusyId(null);
      setConfirmDeleteComment(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
          <Newspaper className="h-5 w-5" style={{ color: COLORS.gold }} /> Blog
        </h1>
      </div>

      <button
        type="button"
        onClick={() => setShowCreateForm((v) => !v)}
        className="mb-4 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
        style={{ background: COLORS.gold, color: "#0a0104" }}
      >
        <Plus className="h-4 w-4" /> New Post
      </button>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <div className="mb-3">
            <label style={labelStyle}>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-3">
            <label style={labelStyle}>Excerpt</label>
            <input type="text" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-3">
            <label style={labelStyle}>Body</label>
            <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div className="mb-3">
            <label style={labelStyle}>Author Name</label>
            <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} style={inputStyle} />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !title.trim() || !excerpt.trim() || !body.trim()}
            className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: COLORS.gold, color: "#0a0104" }}
          >
            {creating ? "Publishing…" : "Publish"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>No posts yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const postComments = allComments.filter((c) => c.blog_id === post.id);
            return (
            <div key={post.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              {editingId === post.id ? (
                <div>
                  <div className="mb-2">
                    <label style={labelStyle}>Title</label>
                    <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
                  </div>
                  <div className="mb-2">
                    <label style={labelStyle}>Excerpt</label>
                    <input type="text" value={editForm.excerpt} onChange={(e) => setEditForm((f) => ({ ...f, excerpt: e.target.value }))} style={inputStyle} />
                  </div>
                  <div className="mb-2">
                    <label style={labelStyle}>Body</label>
                    <textarea rows={6} value={editForm.body} onChange={(e) => setEditForm((f) => ({ ...f, body: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                  <div className="mb-3">
                    <label style={labelStyle}>Author Name</label>
                    <input type="text" value={editForm.author_name} onChange={(e) => setEditForm((f) => ({ ...f, author_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveEdit} disabled={saving} className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: COLORS.gold, color: "#0a0104" }}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{post.title}</p>
                      <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                        {post.author_name} · {post.likes_count} likes · {postComments.length} comments
                        {!post.is_published && <span style={{ color: "#f87171" }}> · Draft</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openEdit(post)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(post)}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                      >
                        {post.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {post.is_published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePost(post)}
                        disabled={busyId === post.id}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.6)" }}>{post.excerpt}</p>

                  <div className="mt-3">
                    <label
                      className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                      style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {uploadingCoverFor === post.id ? "Uploading…" : post.cover_image_url ? "Change cover image" : "Upload cover image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingCoverFor === post.id}
                        onChange={(e) => handleCoverSelect(post.id, e)}
                      />
                    </label>
                    <FilePreview type="image" src={post.cover_image_url} label="Cover" />
                  </div>

                  {/* Comments for THIS post, right here — no separate tab */}
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(245,235,221,0.08)" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedComments(expandedComments === post.id ? null : post.id)}
                      className="flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: "rgba(245,235,221,0.6)" }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {postComments.length} comment{postComments.length === 1 ? "" : "s"} {expandedComments === post.id ? "▲" : "▼"}
                    </button>

                    {expandedComments === post.id && (
                      <div className="mt-2 flex flex-col gap-2">
                        {postComments.length === 0 ? (
                          <p className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>No comments yet.</p>
                        ) : (
                          postComments.map((c) => (
                            <div key={c.id} className="rounded-lg p-2.5" style={{ background: "rgba(245,235,221,0.03)" }}>
                              {editingCommentId === c.id ? (
                                <div>
                                  <textarea rows={2} value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
                                  <div className="mt-1.5 flex gap-2">
                                    <button type="button" onClick={handleSaveCommentEdit} disabled={savingComment} className="rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-50" style={{ background: COLORS.gold, color: "#0a0104" }}>
                                      {savingComment ? "Saving…" : "Save"}
                                    </button>
                                    <button type="button" onClick={() => setEditingCommentId(null)} className="text-[11px]" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-[11px] font-semibold" style={{ color: COLORS.gold }}>{c.user_name}</p>
                                    <p className="text-xs" style={{ color: "rgba(245,235,221,0.85)" }}>{c.content}</p>
                                    <p className="mt-0.5 text-[10px]" style={{ color: "rgba(245,235,221,0.4)" }}>{formatDate(c.created_at)}</p>
                                  </div>
                                  <div className="flex flex-shrink-0 gap-1">
                                    <button type="button" onClick={() => openEditComment(c)} className="rounded p-1 hover:bg-white/5" style={{ color: COLORS.gold }}>
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button type="button" onClick={() => setConfirmDeleteComment(c)} disabled={busyId === c.id} className="rounded p-1 hover:bg-white/5 disabled:opacity-50" style={{ color: "#f87171" }}>
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeletePost}
        title="Delete post"
        message={`Permanently delete "${confirmDeletePost?.title}"? Its comments and likes go with it. This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDeletePost?.id}
        onCancel={() => setConfirmDeletePost(null)}
        onConfirm={handleDeletePostConfirmed}
      />

      <ConfirmDialog
        open={!!confirmDeleteComment}
        title="Delete comment"
        message="Permanently delete this comment? This can't be undone."
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDeleteComment?.id}
        onCancel={() => setConfirmDeleteComment(null)}
        onConfirm={handleDeleteCommentConfirmed}
      />
    </div>
  );
}
