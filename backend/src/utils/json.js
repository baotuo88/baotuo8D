function stripCodeFence(text) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJsonSlice(text) {
  const startCandidates = ["{", "["];
  let start = -1;
  let opening = "";
  let closing = "";

  for (const candidate of startCandidates) {
    const index = text.indexOf(candidate);
    if (index !== -1 && (start === -1 || index < start)) {
      start = index;
      opening = candidate;
      closing = candidate === "{" ? "}" : "]";
    }
  }

  if (start === -1) {
    return text.trim();
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === opening) {
      depth += 1;
      continue;
    }

    if (ch === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1).trim();
      }
    }
  }

  return text.slice(start).trim();
}

export function parseJsonFromModel(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Model response is empty");
  }

  const cleaned = stripCodeFence(rawText);
  const jsonSlice = extractBalancedJsonSlice(cleaned);

  return JSON.parse(jsonSlice);
}
