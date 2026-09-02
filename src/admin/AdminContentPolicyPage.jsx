import React, { useEffect, useState } from "react";
import { FileText, Plus, X, Pencil } from "lucide-react";
import {
  fetchAdminSitePages, updateAdminSitePage,
  fetchAdminFaqs, createAdminFaq, updateAdminFaq, deleteAdminFaq,
} from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const PAGE_SLUGS = [
  { slug: "about", label: "About Us" },
  { slug: "contact", label: "Contact Us" },
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "terms", label: "Terms of Service" },
  { slug: "cookies", label: "Cookie Policy" },
];

export default function AdminContentPolicyPage() {
  const [tab, setTab] = useState("about");
  const [pagesBySlug, setPagesBySlug] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [faqs, setFaqs] = useState([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
  const [addingFaq, setAddingFaq] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState(null);
  const [editFaqForm, setEditFaqForm] = useState({ question: "", answer: "" });
  const [savingFaqId, setSavingFaqId] = useState(null);
  const [deletingFaqId, setDeletingFaqId] = useState(null);

  const loadPages = () => {
    setLoading(true);
    setError("");
    fetchAdminSitePages()
      .then((rows) => {
        const map = {};
        rows.forEach((r) => { map[r.slug] = r; });
        setPagesBySlug(map);
      })
      .catch((err) => setError(err.message || "Couldn't load pages."))
      .finally(() => setLoading(false));
  };
  const loadFaqs = () => {
    setFaqsLoading(true);
    fetchAdminFaqs().then(setFaqs).catch(() => setFaqs([])).finally(() => setFaqsLoading(false));
  };
  useEffect(() => { loadPages(); loadFaqs(); }, []);

  useEffect(() => {
    if (tab === "faqs") return;
    const existing = pagesBySlug[tab];
    const fallbackLabel = PAGE_SLUGS.find((p) => p.slug === tab)?.label || tab;
    setForm({ title: existing?.title || fallbackLabel, content: existing?.content || "" });
    setSaved(false);
  }, [tab, pagesBySlug]);

  const handleSavePage = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateAdminSitePage(tab, form);
      setPagesBySlug((m) => ({ ...m, [tab]: updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    setAddingFaq(true);
    setError("");
    try {
      await createAdminFaq(newFaq);
      setNewFaq({ question: "", answer: "" });
      loadFaqs();
    } catch (err) {
      setError(err.message || "Couldn't add FAQ.");
    } finally {
      setAddingFaq(false);
    }
  };

  const startEditFaq = (f) => { setEditingFaqId(f.id); setEditFaqForm({ question: f.question, answer: f.answer }); };

  const handleSaveFaq = async () => {
    if (!editFaqForm.question.trim() || !editFaqForm.answer.trim()) return;
    setSavingFaqId(editingFaqId);
    setError("");
    try {
      await updateAdminFaq(editingFaqId, editFaqForm);
      setEditingFaqId(null);
      loadFaqs();
    } catch (err) {
      setError(err.message || "Couldn't save FAQ.");
    } finally {
      setSavingFaqId(null);
    }
  };

  const handleDeleteFaq = async (faqId) => {
    setDeletingFaqId(faqId);
    setError("");
    try {
      await deleteAdminFaq(faqId);
      loadFaqs();
    } catch (err) {
      setError(err.message || "Couldn't delete FAQ.");
    } finally {
      setDeletingFaqId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <FileText className="h-6 w-6" style={{ color: COLORS.gold }} /> Content & Policy Management
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        About Us, Contact Us, FAQs, and the applicable policies (Privacy, Terms, Cookies) — all shown in the site footer.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {PAGE_SLUGS.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => setTab(p.slug)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={tab === p.slug ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab("faqs")}
          className="rounded-full px-4 py-1.5 text-xs font-semibold"
          style={tab === "faqs" ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
        >
          FAQs
        </button>
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {tab !== "faqs" ? (
        loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : (
          <div className="max-w-2xl rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
            <div className="mb-3">
              <label style={labelStyle}>Page Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
            </div>
            <div className="mb-4">
              <label style={labelStyle}>Content</label>
              <textarea
                rows={12}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                placeholder="Leave a blank line between paragraphs."
              />
            </div>
            {saved && <p className="mb-3 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}
            <button
              type="button"
              onClick={handleSavePage}
              disabled={saving || !form.title.trim()}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )
      ) : (
        <div className="max-w-2xl">
          <div className="mb-6 rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>Add a question</p>
            <div className="mb-3">
              <label style={labelStyle}>Question</label>
              <input type="text" value={newFaq.question} onChange={(e) => setNewFaq((f) => ({ ...f, question: e.target.value }))} style={inputStyle} />
            </div>
            <div className="mb-4">
              <label style={labelStyle}>Answer</label>
              <textarea rows={3} value={newFaq.answer} onChange={(e) => setNewFaq((f) => ({ ...f, answer: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <button
              type="button"
              onClick={handleAddFaq}
              disabled={addingFaq || !newFaq.question.trim() || !newFaq.answer.trim()}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              <Plus className="h-3.5 w-3.5" /> {addingFaq ? "Adding…" : "Add FAQ"}
            </button>
          </div>

          {faqsLoading ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
          ) : faqs.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No FAQs yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {faqs.map((f) => (
                <div key={f.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
                  {editingFaqId === f.id ? (
                    <>
                      <input type="text" value={editFaqForm.question} onChange={(e) => setEditFaqForm((s) => ({ ...s, question: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
                      <textarea rows={3} value={editFaqForm.answer} onChange={(e) => setEditFaqForm((s) => ({ ...s, answer: e.target.value }))} style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }} />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveFaq}
                          disabled={savingFaqId === f.id}
                          className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                          style={{ background: COLORS.gold, color: "#0a0104" }}
                        >
                          {savingFaqId === f.id ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setEditingFaqId(null)} className="rounded-full px-4 py-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{f.question}</p>
                        <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{f.answer}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEditFaq(f)}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                          style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFaq(f.id)}
                          disabled={deletingFaqId === f.id}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                          style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                        >
                          <X className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
