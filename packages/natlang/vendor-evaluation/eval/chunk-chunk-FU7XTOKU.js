// src/improvement/source-policy.ts
import ts from "typescript";
function instructionSkeleton(path, source) {
  if (path.endsWith(".nl")) {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
    return front ? front[0] : source;
  }
  if (!/\.m?ts$/.test(path)) return source;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true), edits = [];
  const visit = (node) => {
    if (ts.isTaggedTemplateExpression(node) && /^nl(?:<|$)/.test(node.tag.getText(file))) {
      if (ts.isNoSubstitutionTemplateLiteral(node.template)) edits.push([node.template.getStart(file) + 1, node.template.getEnd() - 1]);
      else {
        edits.push([node.template.head.getStart(file) + 1, node.template.head.getEnd() - 2]);
        for (const span of node.template.templateSpans) edits.push([span.literal.getStart(file) + 1, span.literal.getEnd() - (ts.isTemplateTail(span.literal) ? 1 : 2)]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + "<instruction>" + source.slice(end);
  return source;
}
function validateSourceEdit(before, after, mode, allowedFiles) {
  const errors = [];
  for (const path of /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[path] === after[path]) continue;
    if (!allowedFiles.includes(path)) errors.push("edit outside allowed files: " + path);
    if (mode === "instruction" && (before[path] === void 0 || after[path] === void 0 || instructionSkeleton(path, before[path]) !== instructionSkeleton(path, after[path]))) errors.push("instruction-mode edit changed code or contract: " + path);
  }
  return errors;
}
function exportedSignature(source, name) {
  const file = ts.createSourceFile("entry.ts", source, ts.ScriptTarget.ES2022, true);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) && (name === "default" ? node.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) : node.name?.text === name));
  if (!declaration || !ts.isFunctionDeclaration(declaration)) return void 0;
  const normalized = (node) => node?.getText(file).replace(/\s+/g, "") ?? "";
  return JSON.stringify({
    parameters: declaration.parameters.map((parameter) => ({ type: normalized(parameter.type), optional: !!parameter.questionToken || !!parameter.initializer, rest: !!parameter.dotDotDotToken })),
    result: normalized(declaration.type),
    typeParameters: declaration.typeParameters?.map(normalized) ?? []
  });
}

export {
  validateSourceEdit,
  exportedSignature
};
