export const SKINS = ["blob", "peach", "cat", "drop"] as const;

export type Skin = (typeof SKINS)[number];

export const DEFAULT_SKIN: Skin = "blob";

export const STORAGE_KEY = "deskpet.skin";

export const SKIN_LABELS: Record<Skin, string> = {
  blob: "黄豆",
  peach: "蜜桃",
  cat: "猫猫",
  drop: "水滴",
};

export function isSkin(value: string | null | undefined): value is Skin {
  return (SKINS as readonly string[]).includes(value ?? "");
}

export function parseSavedSkin(raw: string | null | undefined): Skin | null {
  if (!raw) return null;
  return isSkin(raw) ? raw : null;
}

export function loadSavedSkin(): Skin {
  try {
    return parseSavedSkin(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function saveSkin(skin: Skin): void {
  try {
    localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    // Quota / private mode — keep the in-session skin anyway.
  }
}
