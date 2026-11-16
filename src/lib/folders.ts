// Folders a session or project works in: choosing one, and what is known about it.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./agent";
import { t } from "./i18n";

/** Mirrors `FolderInfo` in src-tauri/src/folders.rs. */
export interface FolderInfo {
  /** False when the folder has been moved or deleted. */
  isDir: boolean;
  /** Checked-out git branch, if the folder is in a repository. */
  branch: string | null;
}

/** Last path segment: "/work/site/" → "site". */
export const folderName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;

/** A path with the home directory folded to "~", for display. */
export const shortPath = (path: string) => path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, "~");

type DirectoryPicker = () => Promise<{ name: string }>;

/** Folder chooser for browsers without `showDirectoryPicker`. */
function pickWithInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.addEventListener("change", () => resolve(input.files?.[0]?.webkitRelativePath.split("/")[0] || null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Asks the user for a folder. The app gets its full path; a plain browser only
 * reveals the folder's name, which is all the mock agent needs.
 */
export async function pickFolder(): Promise<string | null> {
  if (inTauri) {
    const picked = await open({ directory: true, multiple: false, title: t("Choose a folder") });
    return typeof picked === "string" ? picked : null;
  }
  const picker = (window as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) return pickWithInput();
  try {
    return (await picker.call(window)).name;
  } catch {
    return null; // dismissed
  }
}

/** A bare name (picked in a browser, or carried over from before sessions had folders) has no location to check. */
const isAbsolute = (path: string) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path);

export function folderInfo(path: string): Promise<FolderInfo> {
  return inTauri && isAbsolute(path) ? invoke<FolderInfo>("folder_info", { path }) : Promise.resolve({ isDir: true, branch: null });
}

const known = new Map<string, FolderInfo>();

/** What is known about a folder, looked up again whenever the window regains focus (the branch may have changed). */
export function useFolderInfo(path: string | null | undefined): FolderInfo | null {
  const [info, setInfo] = useState<FolderInfo | null>(() => (path ? (known.get(path) ?? null) : null));
  useEffect(() => {
    if (!path) {
      setInfo(null);
      return;
    }
    setInfo(known.get(path) ?? null);
    let stale = false;
    const load = () =>
      folderInfo(path)
        .then((next) => {
          known.set(path, next);
          if (!stale) setInfo(next);
        })
        .catch(console.error);
    void load();
    window.addEventListener("focus", load);
    return () => {
      stale = true;
      window.removeEventListener("focus", load);
    };
  }, [path]);
  return info;
}
