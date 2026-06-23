// Persist the preparador's identity across sessions (skill §6). Separate key
// from the draft so it survives a cleared draft / completed submission.

export interface PreparadorProfile {
  preparadaPor?: string;
  dni?: number;
  unidadRecorrido?: string;
  inspectorResponsable?: string;
}

const PROFILE_KEY = "tacker-hojaruta-preparador-v1";

export function loadPreparadorProfile(): PreparadorProfile | null {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as PreparadorProfile | null;
  } catch {
    return null;
  }
}

export function savePreparadorProfile(p: PreparadorProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
