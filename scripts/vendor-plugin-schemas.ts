#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
type SchemaSource = {
    url: string;
    file: string;
};
const SOURCES: SchemaSource[] = [
    {
        url: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        file: "ap-plugin-1.0.0.schema.json",
    },
    {
        url: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        file: "ap-mcp-1.0.0.schema.json",
    },
    {
        url: "https://json.schemastore.org/claude-code-plugin-manifest.json",
        file: "claude-plugin-manifest.schema.json",
    },
];
const OUT_DIR = join(import.meta.dirname, "..", "packages", "harnesys", "src", "application", "plugins", "schemas");
function canonicalJson(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function sha256(content: string): string {
    return new Bun.CryptoHasher("sha256").update(content).digest("hex");
}
async function vendor(source: SchemaSource): Promise<string> {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok) {
        throw new Error(`${source.url}: HTTP ${response.status}`);
    }
    const schema: unknown = JSON.parse(await response.text());
    const annotated = {
        "x-vendored-from": response.url,
        "x-vendored-sha256": sha256(canonicalJson(schema)),
        ...(schema as Record<string, unknown>),
    };
    const outPath = join(OUT_DIR, source.file);
    await writeFile(outPath, canonicalJson(annotated), "utf8");
    return outPath;
}
async function main(): Promise<void> {
    await mkdir(OUT_DIR, { recursive: true });
    for (const source of SOURCES) {
        const outPath = await vendor(source);
        console.log(`Wrote ${outPath}`);
    }
}
await main();
