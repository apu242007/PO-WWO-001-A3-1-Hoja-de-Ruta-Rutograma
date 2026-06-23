// localStorage draft persistence with versioning + legacy purge (skill §6).
// Only the serializable draft (text/number/choice + repeat rows) is stored.
// Media Files and the signature dataURL are NOT persisted (size/quota).

import type { HojaRutaDraft } from "../types";
import { emptyDraft } from "../types";

const STORAGE_KEY = "tacker-hojaruta-draft-v1";
const STORAGE_TS_KEY = "tacker-hojaruta-draft-ts-v1";
const LEGACY_KEYS: string[] = [
  // bump versions on breaking shape changes and list old keys here
];

function purgeLegacy(): void {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function loadDraft(): HojaRutaDraft {
  purgeLegacy();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<HojaRutaDraft>;
    const base = emptyDraft();
    const merged: HojaRutaDraft = {
      ...base,
      ...parsed,
      // never persist the signature dataURL — force re-sign each session
      firmaResponsable: undefined,
      tranqueras: Array.isArray(parsed.tranqueras) ? parsed.tranqueras : base.tranqueras,
      tramos:
        Array.isArray(parsed.tramos) && parsed.tramos.length > 0 ? parsed.tramos : base.tramos,
      interferencias:
        Array.isArray(parsed.interferencias) && parsed.interferencias.length > 0
          ? parsed.interferencias
          : base.interferencias,
      cargas:
        Array.isArray(parsed.cargas) && parsed.cargas.length > 0 ? parsed.cargas : base.cargas,
    };
    return merged;
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(draft: HojaRutaDraft): void {
  try {
    // strip the signature dataURL before persisting (can be large)
    const { firmaResponsable: _omit, ...rest } = draft;
    void _omit;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    localStorage.setItem(STORAGE_TS_KEY, new Date().toISOString());
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearDraft(): void {
  purgeLegacy();
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TS_KEY);
  } catch {
    /* ignore */
  }
}

export function draftTimestamp(): string | null {
  try {
    return localStorage.getItem(STORAGE_TS_KEY);
  } catch {
    return null;
  }
}
