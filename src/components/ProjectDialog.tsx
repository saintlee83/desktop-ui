import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteProjectWithUndo } from "../lib/actions";
import { folderName, shortPath } from "../lib/folders";
import { useStore } from "../lib/store";
import { toast } from "../lib/toast";
import { cx, isMac, trapTab, usePresence, useRestoreFocus } from "../lib/util";
import { FolderPicker } from "./FolderPicker";
import { IconButton, Keys } from "./ui";

/** The form itself, mounted afresh for each project so it starts from that project's values. */
function ProjectForm({ target, close }: { target: string; close: () => void }) {
  const [project] = useState(() => useStore.getState().projects.find((p) => p.id === target) ?? null);
  const [name, setName] = useState(project?.name ?? "");
  const [folder, setFolder] = useState<string | null>(project?.folder ?? null);
  const [instructions, setInstructions] = useState(project?.instructions ?? "");
  const dialog = useRef<HTMLFormElement>(null);
  const valid = !!name.trim();

  const save = () => {
    if (!valid) return;
    const s = useStore.getState();
    const input = { name, folder, instructions };
    if (project) s.updateProject(project.id, input);
    else {
      const adopt = s.projectAdopt;
      s.createProject(input, adopt);
      if (adopt) toast(`Moved to “${name.trim()}”`);
    }
    close();
  };

  return (
    <form
      ref={dialog}
      className="dialog project-dialog"
      role="dialog"
      aria-modal
      aria-label={project ? "Edit project" : "New project"}
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
          <h2>{project ? "Edit project" : "New project"}</h2>
          <p className="muted">A place for related sessions, with its own folder and standing instructions.</p>
        </div>
        <IconButton label="Close" kbd="Esc" onClick={close}>
          <X size={16} />
        </IconButton>
      </header>

      <label className="field">
        <span className="field-label">Name</span>
        <span className="input-wrap text">
          <input autoFocus value={name} placeholder="Website redesign" maxLength={60} onChange={(e) => setName(e.target.value)} />
        </span>
      </label>

      <div className="field">
        <span className="field-label">Folder</span>
        <div className="folder-field">
          <FolderPicker folder={folder} onChange={setFolder} empty="Choose a folder" />
          {/* Where it is, unless all that is known is its name (a browser gives no path). */}
          {folder && shortPath(folder) !== folderName(folder) && <span className="folder-path">{shortPath(folder)}</span>}
        </div>
        <span className="field-note">Optional. Sessions in the project start in this folder, where the agent can use its tools.</span>
      </div>

      <label className="field">
        <span className="field-label">
          Instructions
          <span className="field-aside">Sent with every message in the project</span>
        </span>
        <textarea
          className="textarea"
          rows={4}
          value={instructions}
          placeholder="What the agent should know or always do here: conventions, tone, things to avoid…"
          onChange={(e) => setInstructions(e.target.value)}
        />
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
            <Trash2 size={14} /> Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!valid}>
          {project ? "Save" : "Create project"}
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
