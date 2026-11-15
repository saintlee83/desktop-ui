import { Folder, FolderOpen, FolderPlus, FolderX, GitBranch, X } from "lucide-react";
import { folderName, pickFolder, shortPath, useFolderInfo } from "../lib/folders";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { cx } from "../lib/util";
import { Picker, type PickerGroup } from "./Picker";

const CHOOSE = "choose";
const REMOVE = "remove";
const recent = (path: string) => `recent:${path}`;

/**
 * The folder something works in (a session, a project, the terminal view): a pill
 * showing its name and git branch, opening a menu to choose another, pick a recent
 * one, or remove it. Without a folder it reads "Add folder".
 */
export function FolderPicker({
  folder,
  onChange,
  align = "left",
  empty = "Add folder",
  hint,
  kbd,
  removable = true,
  onDone,
}: {
  folder: string | null;
  onChange: (folder: string | null) => void;
  align?: "left" | "right";
  /** What the pill says when there is no folder. */
  empty?: string;
  hint?: string;
  kbd?: string;
  removable?: boolean;
  onDone?: () => void;
}) {
  const recents = useStore((s) => s.recentFolders);
  const info = useFolderInfo(folder);
  const missing = !!folder && info?.isDir === false;
  const listed = folder && !recents.includes(folder) ? [folder, ...recents] : recents;

  const groups: PickerGroup<string>[] = [
    { items: [{ id: CHOOSE, name: folder ? "Choose another folder…" : "Choose folder…", icon: FolderOpen }] },
    ...(listed.length
      ? [{ label: "Recent", items: listed.map((path) => ({ id: recent(path), name: folderName(path), description: shortPath(path), icon: Folder })) }]
      : []),
    ...(folder && removable ? [{ items: [{ id: REMOVE, name: "Remove folder", icon: X, danger: true }] }] : []),
  ];

  const choose = async (id: string) => {
    if (id === REMOVE) return onChange(null);
    const picked = id === CHOOSE ? await pickFolder().catch((e) => void toast(`Couldn't open the folder chooser: ${e}`)) : id.slice(recent("").length);
    if (!picked) return;
    useStore.getState().rememberFolder(picked);
    onChange(picked);
  };

  const Icon = missing ? FolderX : folder ? Folder : FolderPlus;
  return (
    <Picker
      className={cx("folder-picker", folder ? "has-folder" : "is-empty", missing && "is-missing")}
      label="Folder"
      align={align}
      width={300}
      value={folder ? recent(folder) : ""}
      groups={groups}
      hint={missing ? "This folder can't be found" : (hint ?? (folder ? shortPath(folder) : "Give the agent a folder to work in"))}
      kbd={missing ? undefined : kbd}
      onChange={(id) => void choose(id).then(onDone)}
      onDone={onDone}
    >
      <Icon size={14} className="pill-icon" />
      <span className="folder-name">{folder ? folderName(folder) : empty}</span>
      {info?.branch && !missing && (
        <span className="folder-branch">
          <GitBranch size={11} />
          {info.branch}
        </span>
      )}
    </Picker>
  );
}
