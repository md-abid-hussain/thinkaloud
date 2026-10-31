import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { researchLayer, standardFirst, verifyLayer } from "@/lib/language/agent";
import type { LanguageLayer } from "@/lib/language/layer";
import type { LinkCheck } from "@/lib/language/web";
import { ScriptedModel, mapOf, toolCall } from "./helpers";

const GOOD = "https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/charset/CharsetDecoder.html";
const DEAD = "https://example.com/made-up-page";

const check = async (urls: string[]) =>
  new Map<string, LinkCheck>(urls.map((url) => [url, { url, ok: url !== DEAD, status: url === DEAD ? 404 : 200, finalUrl: url, title: null }]));

const layer: LanguageLayer = {
  concepts: [
    {
      concept: "text-encoding",
      in_this_language: "A char is a UTF-16 code unit.",
      study: [
        { name: "CharsetDecoder", kind: "class", why: "Decodes bytes into chars.", url: GOOD },
        { name: "MadeUp", kind: "class", why: "Doesn't exist.", url: DEAD },
      ],
      guides: [],
    },
    { concept: "not-in-the-map", in_this_language: "x", study: [], guides: [] },
  ],
};

describe("the language layer", () => {
  it("keeps only links that open and ids the map knows", async () => {
    const verified = await verifyLayer(await mapOf("wc"), layer, check);
    expect(verified.concepts.map((c) => c.concept)).toEqual(["text-encoding"]);
    expect(verified.concepts[0].study.map((i) => i.name)).toEqual(["CharsetDecoder"]);
  });

  it("puts the language's own docs before test frameworks and libraries", () => {
    const items = [
      { name: "ParameterizedTest", url: "https://docs.junit.org/current/api/x.html" },
      { name: "InputStream", url: "https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/InputStream.html" },
    ];
    expect(standardFirst(items, "java").map((i) => i.name)).toEqual(["InputStream", "ParameterizedTest"]);
  });

  it("runs the research agent until it submits, then verifies the result", async () => {
    const searches: string[] = [];
    const model = new ScriptedModel([
      toolCall("web_search", { query: "Java CharsetDecoder", domains: ["docs.oracle.com"] }),
      toolCall("check_links", { urls: [GOOD] }),
      toolCall("submit_layer", layer),
      new AIMessage("Done."),
    ]);
    const result = await researchLayer(await mapOf("wc"), "java", {
      model,
      search: async (q) => {
        searches.push(q);
        return [{ title: "CharsetDecoder", url: GOOD, snippet: "" }];
      },
      check,
    });
    expect(searches).toEqual(["Java CharsetDecoder"]);
    expect(model.calls).toHaveLength(3);
    expect(result.concepts[0].study).toHaveLength(1);
  });

  it("fails when the agent never submits", async () => {
    const model = new ScriptedModel([new AIMessage("I give up.")]);
    await expect(researchLayer(await mapOf("wc"), "java", { model, search: async () => [], check })).rejects.toThrow(/did not submit/);
  });
});
