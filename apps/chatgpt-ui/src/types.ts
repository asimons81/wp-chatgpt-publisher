import type { Root } from "react-dom/client";

export interface ToolResultMessage {
  structuredContent?: unknown;
  content?: unknown;
  _meta?: unknown;
}
export interface OpenAIHost {
  toolOutput?: unknown;
  toolInput?: unknown;
  callTool?: (name: string, input: Record<string, unknown>) => Promise<ToolResultMessage>;
  openExternal?: (options: { href: string }) => Promise<void>;
  requestDisplayMode?: (options: { mode: "inline" | "pip" | "fullscreen" }) => Promise<void>;
}
declare global {
  interface HTMLElement {
    __wpcpReactRoot?: Root;
  }
  interface Window {
    openai?: OpenAIHost;
  }
}
