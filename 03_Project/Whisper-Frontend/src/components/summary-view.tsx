type SummaryBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

// DEF-005: the backend prompt now asks the model for a markdown-lite shape
// (**heading** lines, "- " bullets, plain prose) instead of one run-on
// paragraph - this parses that shape into real block elements. Text with
// none of those markers (old summaries generated before this fix) just
// falls through as a single paragraph, unchanged from before.
function parseSummary(text: string): SummaryBlock[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: SummaryBlock[] = [];
  let currentList: string[] | null = null;

  function flushList() {
    if (currentList && currentList.length > 0) {
      blocks.push({ type: "list", items: currentList });
    }
    currentList = null;
  }

  for (const line of lines) {
    const headingMatch = line.match(/^\*\*(.+)\*\*$/);
    if (headingMatch) {
      flushList();
      blocks.push({ type: "heading", text: headingMatch[1] });
      continue;
    }
    if (line.startsWith("- ")) {
      currentList ??= [];
      currentList.push(line.slice(2).trim());
      continue;
    }
    flushList();
    blocks.push({ type: "paragraph", text: line });
  }
  flushList();

  return blocks;
}

export function SummaryView({ text }: { text: string }) {
  const blocks = parseSummary(text);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h4 key={i} className="text-sm font-semibold text-foreground first:mt-0">
              {block.text}
            </h4>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
