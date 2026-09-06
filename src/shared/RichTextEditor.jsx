import React, { useEffect, useRef } from "react";
import { Bold, Underline, Palette } from "lucide-react";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37" };

const TEXT_COLORS = ["#f5ebdd", "#D4AF37", "#f87171", "#6FCF97", "#5B9BD5", "#E07B39"];
const FONT_SIZES = [
  { label: "Small", px: "13px" },
  { label: "Normal", px: "15px" },
  { label: "Large", px: "19px" },
  { label: "Extra Large", px: "24px" },
];

// ---------------------------------------------------------------------------
// A small rich-text editor — Bold, Underline, Text Color, Font Size — for
// the handful of places that need real formatting (Organiser "About" page
// sections). A plain <textarea> only stores flat text; it can't render or
// apply bold/underline/color at all, so this uses a contentEditable div
// with a toolbar instead, driven by document.execCommand (still supported
// in every major browser for exactly this small set of commands).
//
// Value is HTML (e.g. "<b>Bold</b> text"). The HTML is re-sanitized
// server-side on every save — see app/html_sanitize.py — so this editor's
// own restraint (only ever emitting bold/underline/span-color/span-size)
// is a UX nicety, not the actual security boundary.
// ---------------------------------------------------------------------------

export default function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false);
  const [sizePickerOpen, setSizePickerOpen] = React.useState(false);

  // Only sync from prop -> DOM on first mount / external reset (e.g.
  // switching which section is being edited) — never on every render,
  // which would fight the browser's own cursor position while typing.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitChange = () => {
    onChange(editorRef.current?.innerHTML || "");
  };

  const runCommand = (command, arg) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const buttonStyle = {
    display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6,
    background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)", fontSize: 12, fontWeight: 500,
  };

  return (
    <div style={{ border: "1px solid rgba(245,235,221,0.15)", borderRadius: 8, overflow: "hidden" }}>
      <div className="flex flex-wrap items-center gap-1.5 border-b p-2" style={{ borderColor: "rgba(245,235,221,0.1)", background: "rgba(0,0,0,0.15)" }}>
        <button type="button" onClick={() => runCommand("bold")} style={buttonStyle} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => runCommand("underline")} style={buttonStyle} title="Underline">
          <Underline className="h-3.5 w-3.5" />
        </button>

        <div className="relative">
          <button type="button" onClick={() => { setColorPickerOpen((v) => !v); setSizePickerOpen(false); }} style={buttonStyle} title="Text color">
            <Palette className="h-3.5 w-3.5" /> Color
          </button>
          {colorPickerOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 flex gap-1.5 rounded-lg p-2" style={{ background: "#150307", border: "1px solid rgba(245,235,221,0.15)" }}>
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { runCommand("foreColor", c); setColorPickerOpen(false); }}
                  className="h-6 w-6 rounded-full"
                  style={{ background: c, border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button type="button" onClick={() => { setSizePickerOpen((v) => !v); setColorPickerOpen(false); }} style={buttonStyle} title="Font size">
            Size
          </button>
          {sizePickerOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg p-1.5" style={{ background: "#150307", border: "1px solid rgba(245,235,221,0.15)" }}>
              {FONT_SIZES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    // execCommand("fontSize") only supports 1-7 (HTML
                    // legacy sizes), not arbitrary px — so this wraps
                    // the current selection in a styled span instead,
                    // which is exactly what the sanitizer's
                    // span+font-size allowlist expects anyway.
                    editorRef.current?.focus();
                    document.execCommand("fontSize", false, "4");
                    const fontElements = editorRef.current?.querySelectorAll('font[size="4"]') || [];
                    fontElements.forEach((el) => {
                      const span = document.createElement("span");
                      span.style.fontSize = s.px;
                      span.innerHTML = el.innerHTML;
                      el.replaceWith(span);
                    });
                    emitChange();
                    setSizePickerOpen(false);
                  }}
                  className="whitespace-nowrap rounded px-2 py-1 text-left text-xs hover:opacity-80"
                  style={{ color: COLORS.cream, fontSize: s.px }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder || "Write something…"}
        className="rich-text-editable min-h-[120px] px-3 py-2.5 text-sm outline-none"
        style={{ color: COLORS.cream, background: "rgba(245,235,221,0.03)" }}
        suppressContentEditableWarning
      />
      <style>{`
        .rich-text-editable:empty:before {
          content: attr(data-placeholder);
          color: rgba(245,235,221,0.35);
        }
      `}</style>
    </div>
  );
}
