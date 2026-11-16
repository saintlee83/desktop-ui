// The Korean dictionary, kept in parts by area of the interface.
import { koChrome } from "./ko-chrome";
import { koCore } from "./ko-core";
import { koPanels } from "./ko-panels";
import { koThread } from "./ko-thread";

export const ko: Record<string, string> = { ...koCore, ...koChrome, ...koThread, ...koPanels };
