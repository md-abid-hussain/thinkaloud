import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { Annotation, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import type { ProjectMap } from "../content";
import { LANGUAGES, type Language } from "../progress";
import { LayerSchema, type LanguageLayer } from "./layer";
import type { LinkCheck, SearchHit } from "./web";

/** Where each language's own documentation lives, so the agent prefers current, official pages. */
const DOCS: Record<Language, string> = {
  java:
    "Java SE 25 API docs (docs.oracle.com/en/java/javase/25/docs/api/), the Java Tutorials (docs.oracle.com/javase/tutorial/), and dev.java. For build and tests: Maven (maven.apache.org) and JUnit (docs.junit.org).",
  python:
    "Python 3.14 docs (docs.python.org/3.14/): the library reference and the HOWTOs. Packages on pypi.org or their official docs sites.",
  node:
    "Node.js API docs (nodejs.org/docs/latest/api/), MDN (developer.mozilla.org) for JavaScript built-ins, and the TypeScript handbook (typescriptlang.org). Packages on npmjs.com or their official docs.",
};

export const RESEARCH_MAX_CALLS = 16;

function prompt(map: ProjectMap, language: Language, typeGuide?: string): string {
  const name = LANGUAGES[language];
  return `You build the "${name}" study notes for one Coding Challenges project. The learner is a junior developer who builds the project themselves and wants to know how ${name} handles each concept, and exactly which classes, modules or functions to study.

For each concept: in_this_language, 2 to 3 sentences in plain words on how ${name} represents and handles the idea; study, the 1 to 3 standard-library pieces central to the concept itself, the ones a learner must understand to implement it; guides, at most one guide from ${name}'s own documentation that explains the concept in ${name}.

Keep it to the concept:
- No plumbing: file paths, argument parsing, formatting output.
- No tooling: build tools, test frameworks, launching other processes, downloading files.
- If a concept has nothing specific to ${name} (testing against a reference tool, for example), say so in in_this_language and leave study empty.
- Fewer, central items beat a long list.
${typeGuide ? `\nWhat this kind of project teaches, and what isn't wanted (pick ${name} items that serve this, never the "not this" list):\n${typeGuide}\n` : ""}

Rules:
- Every item needs the URL of its official documentation page. Find pages with web_search, then confirm every URL with check_links before you use it. Never guess a URL or build one by hand without checking it.
- Prefer current official docs: ${DOCS[language]}
- No code anywhere. Name the thing and say what it's for.
- Cover every concept id below.
- When you're done, call submit_layer once with the whole result.

Project map:
${JSON.stringify({ project: map.project, concepts: map.concepts.map(({ id, name, covers, why_here }) => ({ id, name, covers, why_here })) }, null, 2)}`;
}

export type ResearchDeps = {
  model: BaseChatModel;
  search(query: string, domains?: string[]): Promise<SearchHit[]>;
  check(urls: string[]): Promise<Map<string, LinkCheck>>;
  onModelCall?(message: AIMessage): void;
  maxModelCalls?: number;
  /** The project type's playbook: what it teaches and what isn't wanted (content/playbooks). */
  typeGuide?: string;
};

/** Runs the research agent and returns a layer whose every link has just opened. */
export async function researchLayer(map: ProjectMap, language: Language, deps: ResearchDeps): Promise<LanguageLayer> {
  let submitted: LanguageLayer | null = null;
  const maxCalls = deps.maxModelCalls ?? RESEARCH_MAX_CALLS;

  const tools: StructuredToolInterface[] = [
    tool(
      async ({ query, domains }) => JSON.stringify(await deps.search(query, domains)),
      {
        name: "web_search",
        description: "Search the web. Restrict to documentation sites with domains when you can.",
        schema: z.object({
          query: z.string(),
          domains: z.array(z.string()).optional().describe("Only return results from these domains, such as docs.python.org"),
        }),
      },
    ),
    tool(
      async ({ urls }) => {
        const results = await deps.check(urls);
        return JSON.stringify([...results.values()].map(({ url, ok, status, title }) => ({ url, ok, status, title })));
      },
      {
        name: "check_links",
        description: "Open URLs and report which answered 200, with their page titles. Use it on every URL before submitting.",
        schema: z.object({ urls: z.array(z.string()).min(1).max(20) }),
      },
    ),
    tool(
      async (layer) => {
        submitted = layer;
        return "Saved.";
      },
      { name: "submit_layer", description: "Submit the finished study notes. Call it once, at the end.", schema: LayerSchema },
    ),
  ];

  const State = Annotation.Root({
    ...MessagesAnnotation.spec,
    calls: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  });

  const graph = new StateGraph(State)
    .addNode("agent", async (state: typeof State.State) => {
      const reply = await deps.model.bindTools!(tools).invoke(state.messages);
      deps.onModelCall?.(reply as AIMessage);
      return { messages: [reply], calls: 1 };
    })
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges(
      "agent",
      (state: typeof State.State) => {
        const last = state.messages.at(-1);
        const wantsTools = last && AIMessage.isInstance(last) && last.tool_calls?.length;
        return wantsTools && !submitted && state.calls < maxCalls ? "tools" : END;
      },
      ["tools", END],
    )
    .addConditionalEdges("tools", () => (submitted ? END : "agent"), ["agent", END])
    .compile();

  await graph.invoke(
    { messages: [new SystemMessage(prompt(map, language, deps.typeGuide)), new HumanMessage("Build the study notes now.")] },
    { recursionLimit: maxCalls * 2 + 4 },
  );
  if (!submitted) throw new Error("the research agent did not submit the study notes");
  return verifyLayer(map, submitted, deps.check, language);
}

/** The language's own documentation hosts. Items from these come first; anything else (test frameworks, libraries) after. */
const STANDARD_DOCS: Record<Language, string[]> = {
  java: ["docs.oracle.com", "dev.java"],
  python: ["docs.python.org"],
  node: ["nodejs.org", "developer.mozilla.org", "www.typescriptlang.org"],
};

export function standardFirst<T extends { url: string }>(items: T[], language: Language): T[] {
  const own = (url: string) => {
    try {
      return STANDARD_DOCS[language].includes(new URL(url).hostname);
    } catch {
      return false;
    }
  };
  return [...items.filter((i) => own(i.url)), ...items.filter((i) => !own(i.url))];
}

/** Drops anything the map doesn't know and every link that doesn't open now, and puts the standard library first. */
export async function verifyLayer(
  map: ProjectMap,
  layer: LanguageLayer,
  check: (urls: string[]) => Promise<Map<string, LinkCheck>>,
  language: Language = "java",
): Promise<LanguageLayer> {
  const conceptIds = new Set(map.concepts.map((c) => c.id));
  const urls = layer.concepts.flatMap((c) => [...c.study.map((i) => i.url), ...c.guides.map((g) => g.url)]);
  const results = await check(urls);
  const opens = (url: string) => results.get(url)?.ok === true;
  return {
    concepts: layer.concepts
      .filter((c) => conceptIds.has(c.concept))
      .map((c) => ({ ...c, study: standardFirst(c.study.filter((i) => opens(i.url)), language), guides: c.guides.filter((g) => opens(g.url)) })),
  };
}
