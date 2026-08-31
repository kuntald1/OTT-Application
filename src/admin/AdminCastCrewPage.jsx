import React, { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, ImagePlus, Search, X } from "lucide-react";
import { searchAdminPeople, createAdminPerson, updateAdminPerson, deleteAdminPerson, uploadAdminPersonPhoto } from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const EMPTY_FORM = {
  name: "", occupation: "", date_of_birth: "", birthplace: "",
  about: "", early_life: "", personal_life: "", debut_initial_years: "", breakthrough_beyond: "", recent_projects: "",
};

export default function AdminCastCrewPage() {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = (q = "") => {
    setLoading(true);
    searchAdminPeople(q)
      .then(setPeople)
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(search);
  };

  const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setError("");
    setCreating(true);
    try {
      await createAdminPerson({
        ...createForm,
        date_of_birth: createForm.date_of_birth ? new Date(createForm.date_of_birth).toISOString() : null,
      });
      setCreateForm(EMPTY_FORM);
      setShowCreateForm(false);
      load(search);
    } catch (err) {
      setError(err.message || "Couldn't create profile.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name || "", occupation: p.occupation || "", date_of_birth: toDateInput(p.date_of_birth), birthplace: p.birthplace || "",
      about: p.about || "", early_life: p.early_life || "", personal_life: p.personal_life || "",
      debut_initial_years: p.debut_initial_years || "", breakthrough_beyond: p.breakthrough_beyond || "", recent_projects: p.recent_projects || "",
    });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setError("");
    try {
      await updateAdminPerson(editingId, {
        ...editForm,
        date_of_birth: editForm.date_of_birth ? new Date(editForm.date_of_birth).toISOString() : null,
      });
      setEditingId(null);
      load(search);
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = async (personId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhotoFor(personId);
    setError("");
    try {
      await uploadAdminPersonPhoto(personId, file);
      load(search);
    } catch (err) {
      setError(err.message || "Couldn't upload photo.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    setBusyId(confirmDelete.id);
    setError("");
    try {
      await deleteAdminPerson(confirmDelete.id);
      load(search);
    } catch (err) {
      setError(err.message || "Couldn't delete this person.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
            <Users className="h-5 w-5" style={{ color: COLORS.gold }} /> Cast/Crew Master
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            One reusable profile per person — when tagging cast or crew on a video, typing their name here
            suggests them by autocomplete instead of creating a duplicate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> New Profile
        </button>
      </div>

      <form onSubmit={handleSearch} className="mb-5 flex gap-2">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 320 }}
        />
        <button type="submit" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}>
          <Search className="h-3.5 w-3.5" /> Search
        </button>
      </form>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <PersonFormFields form={createForm} setForm={setCreateForm} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !createForm.name.trim()}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setCreateForm(EMPTY_FORM); }}
              className="rounded-full px-4 py-2 text-xs font-medium"
              style={{ color: "rgba(245,235,221,0.5)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : people.length === 0 ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>No profiles found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {people.map((p) => (
            <div key={p.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              {editingId === p.id ? (
                <div>
                  <PersonFormFields form={editForm} setForm={setEditForm} />
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={handleSaveEdit} disabled={saving} className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: COLORS.gold, color: "#0a0104" }}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(245,235,221,0.06)" }}>
                      {p.photo_url && <img src={p.photo_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{p.name}</p>
                      <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{p.occupation || "—"}</p>
                      {p.birthplace && <p className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{p.birthplace}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label
                      className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                      style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {uploadingPhotoFor === p.id ? "Uploading…" : "Photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPhotoFor === p.id} onChange={(e) => handlePhotoSelect(p.id, e)} />
                    </label>
                    <button type="button" onClick={() => openEdit(p)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(p)}
                      disabled={busyId === p.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete profile"
        message={`Delete "${confirmDelete?.name}"? This only works if they're not currently credited on any video — remove them from those videos' cast/crew first if needed.`}
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDelete?.id}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}

function PersonFormFields({ form, setForm }) {
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div>
        <label style={labelStyle}>Name *</label>
        <input type="text" value={form.name} onChange={set("name")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Occupation</label>
        <input type="text" placeholder="e.g. Actor, Director" value={form.occupation} onChange={set("occupation")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Date of Birth</label>
        <input type="date" value={form.date_of_birth} onChange={set("date_of_birth")} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Birthplace</label>
        <input type="text" value={form.birthplace} onChange={set("birthplace")} style={inputStyle} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>About</label>
        <textarea rows={2} value={form.about} onChange={set("about")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Early Life</label>
        <textarea rows={2} value={form.early_life} onChange={set("early_life")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Personal Life</label>
        <textarea rows={2} value={form.personal_life} onChange={set("personal_life")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Debut & Initial Years</label>
        <textarea rows={2} value={form.debut_initial_years} onChange={set("debut_initial_years")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Breakthrough & Beyond</label>
        <textarea rows={2} value={form.breakthrough_beyond} onChange={set("breakthrough_beyond")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="sm:col-span-2">
        <label style={labelStyle}>Recent Projects</label>
        <textarea rows={2} value={form.recent_projects} onChange={set("recent_projects")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
    </div>
  );
}
