import path from "node:path";
import { BaseChatModel, type BaseChatModelCallOptions } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { readGenerated, readMaps, type ProjectMap } from "@/lib/content";
import type { Generated } from "@/lib/gen/schema";
import { pool } from "@/lib/db";
import { migrate } from "@/lib/migrate";

export const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "content");

export async function maps(): Promise<ProjectMap[]> {
  return readMaps(CONTENT_DIR);
}

export async function mapOf(slug: string): Promise<ProjectMap> {
  const map = (await maps()).find((m) => m.project.slug === slug);
  if (!map) throw new Error(`no map ${slug}`);
  return map;
}

export async function generatedOf(slug: string): Promise<Generated> {
  const generated = await readGenerated(slug, await mapOf(slug), CONTENT_DIR);
  if (!generated) throw new Error(`no generated layer for ${slug}`);
  return generated;
}

/** Drops everything in the test database and applies the migrations again. */
export async function resetDb(): Promise<void> {
  await pool().query("drop schema public cascade; create schema public;");
  await migrate(path.resolve(import.meta.dirname, "..", "db", "migrations"));
}

/** A chat model that replies with a fixed script, one message per call, and records what it was sent. */
export class ScriptedModel extends BaseChatModel {
  readonly calls: { messages: BaseMessage[]; toolChoice?: unknown }[] = [];
  private pendingToolChoice: unknown;

  constructor(private readonly script: AIMessage[]) {
    super({});
  }

  _llmType() {
    return "scripted";
  }

  bindTools(_tools: unknown[], kwargs?: Partial<BaseChatModelCallOptions> & { tool_choice?: unknown }) {
    this.pendingToolChoice = kwargs?.tool_choice;
    return this as never;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.calls.push({ messages, toolChoice: this.pendingToolChoice });
    const next = this.script.shift() ?? new AIMessage("(script ended)");
    return { generations: [{ text: typeof next.content === "string" ? next.content : "", message: next }] };
  }
}

export function toolCall(name: string, args: Record<string, unknown>, id = `${name}-${Math.random().toString(36).slice(2, 8)}`) {
  return new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });
}
