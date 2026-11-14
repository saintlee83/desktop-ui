// Thin client over the Rust agent runtime. When running in a plain browser
// (`pnpm dev` without Tauri) it falls back to an in-process mock so the UI is
// still fully usable.

import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { AgentEvent, ModelInfo, RunRequest } from "./types";
import * as mock from "./mock";

export const inTauri = isTauri();

export function listModels(): Promise<ModelInfo[]> {
  return inTauri ? invoke<ModelInfo[]>("list_models") : Promise.resolve(mock.MODELS);
}

/** Starts a run and returns its id. Events arrive via `onEvent` until `done` or `error`. */
export async function startRun(
  request: RunRequest,
  onEvent: (e: AgentEvent) => void,
): Promise<string> {
  if (!inTauri) return mock.startRun(request, onEvent);
  const channel = new Channel<AgentEvent>();
  channel.onmessage = onEvent;
  return invoke<string>("run_agent", { request, onEvent: channel });
}

export function cancelRun(runId: string): Promise<void> {
  return inTauri ? invoke("cancel_agent", { runId }) : mock.cancelRun(runId);
}

export function respondPermission(id: string, allow: boolean): Promise<void> {
  return inTauri ? invoke("respond_permission", { id, allow }) : mock.respondPermission(id, allow);
}
