#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import ts from "typescript"

const files = execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)

const printer = ts.createPrinter({
  removeComments: true,
  newLine: ts.NewLineKind.LineFeed,
})

let changed = 0
for (const file of files) {
  const source = readFileSync(file, "utf8")
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const printed = printer.printFile(sourceFile)
  if (printed !== source) {
    writeFileSync(file, printed)
    changed++
  }
}

console.log(`stripped comments in ${changed}/${files.length} files`)
