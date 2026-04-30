export function parseJsonFromModel(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Model response is empty");
  }

  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}
