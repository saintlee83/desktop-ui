// Files attached to a prompt. A file on disk (dropped on the window, or chosen in the app's
// file dialog) goes by its path; one that only exists in the page (pasted, or picked in the
// browser preview) carries its content: text as text, an image as a data URL.

import { inTauri } from "./agent";
import { t } from "./i18n";
import { basename } from "./util";
import type { PendingFile } from "./types";

/** Text larger than this is attached by name only. */
const MAX_TEXT = 512 * 1024;
/** Images larger than this are attached by name only. */
const MAX_IMAGE = 8 * 1024 * 1024;
/** Edge of the preview kept with the message, px. */
const THUMB = 96;

const TEXT_EXT = /\.(txt|md|markdown|json|jsonc|ya?ml|toml|ini|csv|tsv|xml|html?|css|scss|less|[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|fish|sql|graphql|proto|vue|svelte|lua|r|pl|ex|exs|erl|hs|scala|dart|log|env|gitignore|dockerfile|makefile)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i;

export const isImage = (f: { name: string; mime?: string }) => (f.mime ?? "").startsWith("image/") || IMAGE_EXT.test(f.name);

const readAs = (file: Blob, how: "text" | "dataURL") =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    if (how === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });

/** A small preview of an image, as a data URL, or undefined if it can't be drawn. */
async function thumbnail(src: string): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, THUMB / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

/** A file from the page (paste, drop in the browser, the browser's file chooser). */
export async function fromFile(file: File): Promise<PendingFile> {
  const name = file.name || (file.type.startsWith("image/") ? t("pasted image.png") : t("pasted file"));
  const base: PendingFile = { name, size: file.size, mime: file.type || undefined };
  try {
    if (isImage(base) && file.size <= MAX_IMAGE) {
      const content = await readAs(file, "dataURL");
      return { ...base, content, thumb: await thumbnail(content) };
    }
    if ((file.type.startsWith("text/") || TEXT_EXT.test(name) || /json|xml|javascript/.test(file.type)) && file.size <= MAX_TEXT) {
      return { ...base, content: await readAs(file, "text") };
    }
  } catch (e) {
    console.error(`couldn't read ${name}`, e);
  }
  return base; // too large, or not text or an image: sent by name
}

/** A file on disk, by its path. */
export const fromPath = (path: string): PendingFile => ({ name: basename(path), path });

/** Asks for files to attach: the native dialog in the app (which gives paths), the browser's otherwise. */
export async function chooseFiles(): Promise<PendingFile[]> {
  if (inTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: true, directory: false, title: t("Attach files") });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    return paths.map(fromPath);
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", multiple: true });
    input.addEventListener("change", () => void Promise.all(Array.from(input.files ?? []).map(fromFile)).then(resolve));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** "12 KB", "3.4 MB". */
export function formatSize(bytes: number | undefined) {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
