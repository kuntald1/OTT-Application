import React, { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import RichTextEditor from "./RichTextEditor";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};

// ---------------------------------------------------------------------------
// Shared CRUD UI for a Plays Organiser's "About" page sections — used both
// on Manage Profile (the organiser editing their own) and in the admin
// panel (an admin editing on the organiser's behalf). All the actual
// fetch/create/update/delete calls are passed in as props so this
// component doesn't care whether it's talking to the self-service or
// admin API endpoints.
// ---------------------------------------------------------------------------

export default function OrganiserProfileSectionsEditor({ sections, loading, error, onCreate, onUpdate, onDelete }) {
  const [addingNew, setAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const startAdd = () => { setAddingNew(true); setNewTitle(""); setNewContent(""); };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await onCreate({ title: newTitle.trim(), contentHtml: newContent });
      setAddingNew(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s) => { setEditingId(s.id); setEditTitle(s.title); setEditContent(s.content_html); };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEditId(editingId);
    try {
      await onUpdate(editingId, { title: editTitle.trim(), contentHtml: editContent });
      setEditingId(null);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {error && <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((s) => (
            <div key={s.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              {editingId === s.id ? (
                <div>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Section title" />
                  <RichTextEditor value={editContent} onChange={setEditContent} placeholder="Write this section's content…" />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingEditId === s.id || !editTitle.trim()}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {savingEditId === s.id ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-4 py-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{s.title}</p>
                    <div className="flex flex-shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                        style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                      >
                        <X className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                  {/* content_html is sanitized server-side (app/html_sanitize.py) before it's ever stored,
                      so this dangerouslySetInnerHTML only ever renders the small allowed formatting set. */}
                  <div
                    className="text-sm leading-relaxed"
                    style={{ color: "rgba(245,235,221,0.75)" }}
                    dangerouslySetInnerHTML={{ __html: s.content_html || "<span style='color:rgba(245,235,221,0.35)'>(empty)</span>" }}
                  />
                </div>
              )}
            </div>
          ))}

          {sections.length === 0 && !addingNew && (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No sections yet.</p>
          )}
        </div>
      )}

      {addingNew ? (
        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Section title — e.g. About, Early days, Awards" />
          <RichTextEditor value={newContent} onChange={setNewContent} placeholder="Write this section's content…" />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !newTitle.trim()}
              className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {saving ? "Adding…" : "Add section"}
            </button>
            <button type="button" onClick={() => setAddingNew(false)} className="rounded-full px-4 py-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startAdd}
          className="mt-4 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
          style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
        >
          <Plus className="h-3.5 w-3.5" /> Add section
        </button>
      )}
    </div>
  );
}
