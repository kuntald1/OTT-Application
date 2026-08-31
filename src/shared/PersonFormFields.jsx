import React from "react";

const COLORS = { cream: "#f5ebdd" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export const EMPTY_PERSON_FORM = {
  name: "", occupation: "", date_of_birth: "", birthplace: "",
  about: "", early_life: "", personal_life: "", debut_initial_years: "", breakthrough_beyond: "", recent_projects: "",
};

export default function PersonFormFields({ form, setForm }) {
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
