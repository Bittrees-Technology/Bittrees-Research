import { useState } from "react";

/** Multi-select toggle chips from a fixed option list. */
export function ChipMultiSelect({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }} role="group">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-label={o}
            aria-pressed={on}
            onClick={() => toggle(o)}
            style={{
              padding: "0.4rem 0.95rem",
              fontFamily: "var(--font-sans)",
              fontSize: "0.85rem",
              fontWeight: on ? 700 : 400,
              color: on ? "var(--color-ink)" : "var(--color-ink-muted)",
              background: on ? "var(--color-bg-subtle)" : "#ffffff",
              border: `1px solid ${on ? "var(--color-primary)" : "var(--color-border)"}`,
              borderRadius: "999px",
              cursor: "pointer",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Searchable multi-select with free-text custom entries ("other"). */
export function SearchMultiSelect({ options, value, onChange, placeholder }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const lc = (s: string) => s.toLowerCase();
  const selected = new Set(value.map(lc));
  const query = q.trim();
  const matches = options.filter((o) => !selected.has(lc(o)) && lc(o).includes(lc(query))).slice(0, 8);
  const showCustom = query.length > 0 && !options.some((o) => lc(o) === lc(query)) && !selected.has(lc(query));

  function add(v: string) {
    if (!selected.has(lc(v))) onChange([...value, v]);
    setQ("");
    setOpen(false);
  }
  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
  }

  return (
    <div style={{ position: "relative" }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.4rem" }}>
          {value.map((v) => (
            <span key={v} style={chip}>
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} style={chipX}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Search…"}
        style={input}
      />
      {open && (matches.length > 0 || showCustom) && (
        <div style={dropdown}>
          {matches.map((o) => (
            <button key={o} type="button" onMouseDown={(e) => { e.preventDefault(); add(o); }} style={option}>{o}</button>
          ))}
          {showCustom && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); add(query); }} style={{ ...option, fontStyle: "italic" }}>Add “{query}”</button>
          )}
        </div>
      )}
    </div>
  );
}

const input = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.9rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.15rem 0.5rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.78rem",
  color: "var(--color-ink)",
  background: "var(--color-bg-subtle)",
  border: "1px solid var(--color-border)",
  borderRadius: "999px",
};
const chipX = { background: "none", border: "none", cursor: "pointer", color: "var(--color-ink-dim)", fontSize: "0.85rem", lineHeight: 1, padding: 0 };
const dropdown = {
  position: "absolute" as const,
  top: "calc(100% + 2px)",
  left: 0,
  right: 0,
  zIndex: 20,
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
  maxHeight: "220px",
  overflowY: "auto" as const,
};
const option = {
  display: "block",
  width: "100%",
  textAlign: "left" as const,
  padding: "0.45rem 0.7rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.85rem",
  color: "var(--color-ink)",
  background: "none",
  border: "none",
  cursor: "pointer",
};
