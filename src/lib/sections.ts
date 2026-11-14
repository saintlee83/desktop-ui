import { Briefcase, CodeXml, MessageCircle, type LucideIcon } from "lucide-react";
import type { Section } from "./types";

export interface SectionInfo {
  id: Section;
  label: string;
  icon: LucideIcon;
  /** ⌘/Ctrl plus this digit switches to the section. */
  key: string;
  hint: string;
}

/** The top-level sections, in the order they appear in the switch. */
export const SECTIONS: SectionInfo[] = [
  { id: "chat", label: "Chat", icon: MessageCircle, key: "1", hint: "Plain conversation, no tools" },
  { id: "work", label: "Work", icon: Briefcase, key: "2", hint: "Agent tasks in your workspace" },
  { id: "code", label: "Code", icon: CodeXml, key: "3", hint: "Coding sessions in your repository" },
];

export const sectionInfo = (id: Section) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
