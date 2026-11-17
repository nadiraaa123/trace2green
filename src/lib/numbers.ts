// Parsing numbers typed by Indonesian users on a phone keyboard.
// "1.250" = 1250 (dot as thousands separator), "28,9" = 28.9 (comma decimal),
// "1.250,5" = 1250.5. A plain "28.9" is accepted as 28.9.
// Empty input returns null (missing), never 0.

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

export function parseIdNumber(raw: string): ParseResult {
  const s = raw.replace(/\s/g, "");
  if (s === "") return { ok: true, value: null };
  if (s.startsWith("-")) return { ok: false, error: "Angka tidak boleh negatif" };
  let normalized: string;
  if (s.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return { ok: false, error: "Format angka tidak valid" };
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, "");
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    normalized = s;
  } else {
    return { ok: false, error: "Hanya angka, contoh 1.250 atau 28,9" };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: "Format angka tidak valid" };
  if (value >= 1e9) return { ok: false, error: "Angka terlalu besar" };
  return { ok: true, value };
}

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
export const formatId = (n: number | null | undefined) => (n == null ? "—" : fmt.format(n));
/** Show a stored number back in the input in Indonesian format. */
export const toInput = (n: number | null | undefined) => (n == null ? "" : fmt.format(n));
