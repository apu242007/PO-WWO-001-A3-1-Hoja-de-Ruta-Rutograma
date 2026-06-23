// Shared parse/format helpers (es-AR).

/** strip non-digit → integer Number | undefined */
export function parseInt0(raw: string): number | undefined {
  const clean = raw.replace(/[^\d]/g, "");
  if (!clean) return undefined;
  return Number(clean);
}

/** parse decimal accepting "," or "." as separator → Number | undefined */
export function parseDecimal(raw: string): number | undefined {
  const clean = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}

/** Number → '123.456' (es-AR thousands) */
export function formatInt(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/** Number → '1.234,5' (es-AR, up to 2 decimals) */
export function formatDecimal(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** datetime-local / date string → localized es-AR display */
export function displayDateTime(s: string | undefined | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Dominio / patente AR ---------------------------------------------------
// Dos formatos: viejo ABC-123 (3 letras + 3 dígitos = 6 chars) y Mercosur
// AB-123-WE (2 letras + 3 dígitos + 2 letras = 7 chars). El 3er carácter define
// cuál: letra → viejo, dígito → Mercosur. Auto-formatea progresivamente con "-".
export function formatDominio(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length === 0) return "";
  if (clean.length <= 2) return clean;
  if (/^[A-Z]{3}/.test(clean)) {
    // viejo: ABC-123
    if (clean.length <= 3) return clean;
    return clean.slice(0, 3) + "-" + clean.slice(3, 6);
  }
  // Mercosur: AB-123-WE
  if (clean.length <= 5) return clean.slice(0, 2) + "-" + clean.slice(2);
  return clean.slice(0, 2) + "-" + clean.slice(2, 5) + "-" + clean.slice(5, 7);
}

export function isValidDominio(p: string): boolean {
  return /^[A-Z]{3}-\d{3}$/.test(p) || /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(p);
}

export function displayDate(s: string | undefined | null): string {
  if (!s) return "—";
  // date-only string 'YYYY-MM-DD' — render without tz shift
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}
