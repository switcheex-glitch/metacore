export function sanitizeAssistantText(text: string): string {
  if (!text) return text ?? "";
  // Strip markdown bold/italic/heading/blockquote/rule markers so the UI
  // renders clean prose; emoji and punctuation pass through unchanged.
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, "$1")
    .replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^---+\s*$/gm, "")
    .replace(/^>\s?/gm, "");
}
