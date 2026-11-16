import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteProjectWithUndo } from "../lib/actions";
import { folderName, shortPath } from "../lib/folders";
import { useT } from "../lib/i18n";
import { useStore, type PermissionMode } from "../lib/store";
import { toast } from "../lib/toast";
import { cx, isMac, trapTab, usePresence, useRestoreFocus } from "../lib/util";
import { FolderPicker } from "./FolderPicker";
import { IconButton, Keys } from "./ui";

/** The form itself, mounted afresh for each project so it starts from that project's values. */
function ProjectForm({ target, close }: { target: string; close: () => void }) {
  const t = useT();
  const [project] = useState(() => useStore.getState().projects.find((p) => p.id === target) ?? null);
  const [name, setName] = useState(project?.name ?? "");
  const [folder, setFolder] = useState<string | null>(project?.folder ?? null);
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const [permissionMode, setPermissionMode] = useState<PermissionMode | null>(project?.permissionMode ?? null);
  const dialog = useRef<HTMLFormElement>(null);
  const valid = !!name.trim();

  const save = () => {
    if (!valid) return;
    const s = useStore.getState();
    const input = { name, folder, instructions, permissionMode };
    if (project) s.updateProject(project.id, input);
    else {
      const adopt = s.projectAdopt;
      s.createProject(input, adopt);
      if (adopt) toast(t("Moved to “{name}”", { name: name.trim() }));
    }
    close();
  };

  return (
    <form
      ref={dialog}
      className="dialog project-dialog"
      role="dialog"
      aria-modal
      aria-label={project ? t("Edit project") : t("New project")}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        trapTab(e);
        // Esc first closes a menu that is open inside the dialog.
        if (e.key === "Escape" && !dialog.current?.querySelector("[data-esc-layer]")) close();
        if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
          e.preventDefault(); // or a text field would submit the form a second time
          save();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <header className="dialog-header">
        <div>
          <h2>{project ? t("Edit project") : t("New project")}</h2>
          <p className="muted">{t("A place for related sessions, with its own folder and standing instructions.")}</p>
        </div>
        <IconButton label={t("Close")} kbd="Esc" onClick={close}>
          <X size={16} />
        </IconButton>
      </header>

      <label className="field">
        <span className="field-label">{t("Name")}</span>
        <span className="input-wrap text">
          <input autoFocus value={name} placeholder={t("Website redesign")} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </span>
      </label>

      <div className="field">
        <span className="field-label">{t("Folder")}</span>
        <div className="folder-field">
          <FolderPicker folder={folder} onChange={setFolder} empty={t("Choose a folder")} />
          {/* Where it is, unless all that is known is its name (a browser gives no path). */}
          {folder && shortPath(folder) !== folderName(folder) && <span className="folder-path">{shortPath(folder)}</span>}
        </div>
        <span className="field-note">{t("Optional. Sessions in the project start in this folder, where the agent can use its tools.")}</span>
      </div>

      <label className="field">
        <span className="field-label">
          {t("Instructions")}
          <span className="field-aside">{t("Sent with every message in the project")}</span>
        </span>
        <textarea
          className="textarea"
          rows={4}
          value={instructions}
          placeholder={t("What the agent should know or always do here: conventions, tone, things to avoid…")}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">
          {t("Permissions")}
          <span className="field-aside">{t("When the agent asks before acting here")}</span>
        </span>
        <span className="select-wrap wide">
          <select value={permissionMode ?? ""} onChange={(e) => setPermissionMode((e.target.value || null) as PermissionMode | null)}>
            <option value="">{t("As in Settings")}</option>
            <option value="ask">{t("Ask before actions")}</option>
            <option value="acceptEdits">{t("Auto-accept edits")}</option>
            <option value="bypass">{t("Full auto (never ask)")}</option>
          </select>
        </span>
      </label>

      <footer className="dialog-footer">
        {project && (
          <button
            type="button"
            className="btn ghost danger"
            onClick={() => {
              close();
              deleteProjectWithUndo(project);
            }}
          >
            <Trash2 size={14} /> {t("Delete")}
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={close}>
          {t("Cancel")}
        </button>
        <button type="submit" className="btn primary" disabled={!valid}>
          {project ? t("Save") : t("Create project")}
          <Keys combo={isMac ? "⌘↵" : "Ctrl+↵"} />
        </button>
      </footer>
    </form>
  );
}

/** Creates a project or edits one: its name, the folder it works in, and its instructions. */
export function ProjectDialog() {
  const target = useStore((s) => s.projectDialog);
  const close = useStore((s) => s.closeProjectDialog);
  const open = target !== null;
  const { mounted, closing } = usePresence(open, 140);
  useRestoreFocus(open);
  // While it fades out the dialog still shows the project it was opened for.
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (target !== null) setShown(target);
  }, [target]);
  const which = target ?? shown;
  if (!mounted || which === null) return null;

  return (
    <div className={cx("overlay", closing && "closing")} onMouseDown={close}>
      <ProjectForm key={which} target={which} close={close} />
    </div>
  );
}
