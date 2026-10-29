import { test } from "node:test";
import assert from "node:assert/strict";
import { guestOn, one } from "./setup";
import { allowed, docsFor, verifyLink } from "@/lib/web";
import { _claim, apiNameOk, cleanNote } from "@/lib/research";

test("the allow-list accepts official docs over https only, including subdomains", () => {
  const java = docsFor("Java");
  assert.ok(allowed("https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/charset/CharsetDecoder.html", java));
  assert.ok(!allowed("http://docs.oracle.com/x", java), "http is refused");
  assert.ok(!allowed("https://docs.oracle.com.evil.example/x", java), "a lookalike host is refused");
  assert.ok(!allowed("https://user:pw@docs.oracle.com/x", java), "credentials in a URL are refused");
  assert.ok(!allowed("https://stackoverflow.com/q/1", java));
  assert.ok(!allowed("not a url", java));
  assert.deepEqual(docsFor("klingon"), []);
  assert.ok(docsFor("java", "spring boot").includes("docs.spring.io"));
});

const fake = (routes: Record<string, { status: number; location?: string }>) =>
  (async (url: string) => {
    const r = routes[url];
    if (!r) throw new Error("network");
    return { status: r.status, headers: r.location ? { location: r.location } : {}, body: "" };
  }) as any;

test("a link counts only when it answers 200 and every redirect stays on the allow-list", async () => {
  const d = ["docs.oracle.com"];
  assert.equal(await verifyLink("https://docs.oracle.com/a", d, fake({ "https://docs.oracle.com/a": { status: 200 } })), "https://docs.oracle.com/a");
  assert.equal(await verifyLink("https://docs.oracle.com/old", d, fake({
    "https://docs.oracle.com/old": { status: 301, location: "/new" }, "https://docs.oracle.com/new": { status: 200 },
  })), "https://docs.oracle.com/new");
  assert.equal(await verifyLink("https://docs.oracle.com/out", d, fake({ "https://docs.oracle.com/out": { status: 302, location: "https://evil.example/" } })), null);
  assert.equal(await verifyLink("https://docs.oracle.com/gone", d, fake({ "https://docs.oracle.com/gone": { status: 404 } })), null);
  assert.equal(await verifyLink("https://docs.oracle.com/down", d, fake({})), null);
  assert.equal(await verifyLink("https://evil.example/", d, fake({ "https://evil.example/": { status: 200 } })), null);
});

test("language notes name APIs without code, and keep only verified links", async () => {
  assert.ok(apiNameOk("java.nio.charset.CharsetDecoder"));
  assert.ok(apiNameOk("String.codePointCount"));
  assert.ok(apiNameOk("Character.isSurrogate()"));
  assert.ok(!apiNameOk("s.codePointCount(0, s.length())"));
  assert.ok(!apiNameOk("var x = 1;"));
  const ok = async (u: string) => (u.includes("good") ? u : null);
  const r = await cleanNote({
    summary: "Java decodes bytes to chars with a Charset and its decoder.",
    classes: [
      { name: "CharsetDecoder", purpose: "Turns bytes into chars and keeps a half-finished character between calls." },
      { name: "new String(bytes, UTF_8)", purpose: "x" },
      { name: "Normalizer", purpose: "```java\nNormalizer.normalize(s)\n```" },
    ],
    pitfalls: ["Decoding each chunk on its own splits multi-byte characters."],
    links: [{ title: "CharsetDecoder", url: "https://docs.oracle.com/good" }, { title: "Made up", url: "https://docs.oracle.com/bad" }],
  }, ["docs.oracle.com"], ok as any);
  assert.deepEqual(r.data!.classes.map((c) => c.name), ["CharsetDecoder"]);
  assert.deepEqual(r.data!.links.map((l) => l.url), ["https://docs.oracle.com/good"]);
  assert.ok(r.dropped.includes("https://docs.oracle.com/bad"));
  const none = await cleanNote({ summary: "Something long enough.", classes: [{ name: "Charset", purpose: "Names an encoding." }], pitfalls: [], links: [{ title: "x", url: "https://docs.oracle.com/bad" }] }, ["docs.oracle.com"], ok as any);
  assert.match(none.error!, /200/);
});

test("the cache is single-flight: one run generates a concept and language, a stale or failed claim is taken over", async () => {
  await guestOn();
  const c = (await one<{ id: string }>(`select id from concept order by slug limit 1`))!;
  assert.equal(await _claim(c.id, "java", ""), true);
  assert.equal(await _claim(c.id, "java", ""), false, "a second run skips a concept that is being generated");
  assert.equal(await _claim(c.id, "python", ""), true, "another language is separate");
  await one(`update concept_language set status = 'failed' where concept_id = $1 and language = 'java'`, [c.id]);
  assert.equal(await _claim(c.id, "java", ""), true, "a failed one is retried");
  await one(`update concept_language set status = 'done' where concept_id = $1 and language = 'java'`, [c.id]);
  assert.equal(await _claim(c.id, "java", ""), false, "a finished one is reused, not regenerated");
});
