function normalizeLine(line) {
  return String(line ?? "")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFingerprint(line) {
  return normalizeLine(line)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function detectLanguage(text) {
  const sample = String(text ?? "").slice(0, 8000);
  const zhCount = (sample.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const enCount = (sample.match(/[A-Za-z]/g) ?? []).length;

  if (zhCount === 0 && enCount === 0) {
    return "unknown";
  }

  return zhCount >= enCount ? "zh" : "en";
}

function applyTerminologyNormalization(text, language) {
  const rulesZh = [
    [/8\s*D/giu, "8D"],
    [/5\s*Why/giu, "5Why"],
    [/Root\s*Cause/giu, "根因"],
    [/Containment/giu, "围堵措施"],
    [/Corrective\s*Action(s)?/giu, "纠正措施"],
    [/Preventive\s*Action(s)?/giu, "预防措施"],
    [/CAPA/giu, "纠正与预防措施"],
    [/SOP/giu, "作业指导书"]
  ];
  const rulesEn = [
    [/５\s*Ｗｈｙ/gu, "5Why"],
    [/８\s*Ｄ/gu, "8D"],
    [/根因/gu, "root cause"],
    [/围堵措施/gu, "containment action"],
    [/纠正措施/gu, "corrective action"],
    [/预防措施/gu, "preventive action"],
    [/作业指导书/gu, "SOP"]
  ];

  const rules = language === "en" ? rulesEn : rulesZh;
  let normalized = String(text ?? "");
  for (const [pattern, replacement] of rules) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

function isLikelyHeaderFooter(line) {
  if (!line) {
    return false;
  }

  if (/^第?\s*\d+\s*页(\s*\/\s*共?\s*\d+\s*页)?$/u.test(line)) {
    return true;
  }

  if (/^page\s*\d+(\s*of\s*\d+)?$/iu.test(line)) {
    return true;
  }

  if (/^(confidential|internal use only|版权所有|仅供内部)/iu.test(line)) {
    return true;
  }

  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/u.test(line)) {
    return true;
  }

  return false;
}

function removeHeaderFooterLines(lines) {
  if (lines.length < 8) {
    return lines;
  }

  const edgeCandidates = new Map();
  const block = 3;
  const totalBlocks = Math.floor(lines.length / block);

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const from = blockIndex * block;
    const to = Math.min(from + block, lines.length);
    const head = lines.slice(from, Math.min(from + 2, to));
    const tail = lines.slice(Math.max(to - 2, from), to);

    for (const line of [...head, ...tail]) {
      const fp = buildFingerprint(line);
      if (!fp) {
        continue;
      }
      edgeCandidates.set(fp, (edgeCandidates.get(fp) ?? 0) + 1);
    }
  }

  const repeatedEdge = new Set(
    Array.from(edgeCandidates.entries())
      .filter(([, count]) => count >= 3)
      .map(([fp]) => fp)
  );

  return lines.filter((line) => {
    const fp = buildFingerprint(line);
    if (!fp) {
      return false;
    }
    if (isLikelyHeaderFooter(line)) {
      return false;
    }
    if (repeatedEdge.has(fp) && fp.length >= 6) {
      return false;
    }
    return true;
  });
}

function dedupeSimilarLines(lines) {
  const seen = new Set();
  const kept = [];

  for (const line of lines) {
    const fp = buildFingerprint(line);
    if (!fp || fp.length < 3) {
      continue;
    }

    const shortKey = fp.slice(0, 80);
    if (seen.has(shortKey)) {
      continue;
    }

    seen.add(shortKey);
    kept.push(line);
  }

  return kept;
}

export function cleanText(rawText) {
  const base = String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[ \t]+\n/g, "\n");

  const language = detectLanguage(base);
  const standardized = applyTerminologyNormalization(base, language);
  const normalizedLines = standardized
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);
  const withoutHeaderFooter = removeHeaderFooterLines(normalizedLines);
  const deduped = dedupeSimilarLines(withoutHeaderFooter);
  const cleanedText = deduped.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    text: cleanedText,
    metadata: {
      language,
      original_line_count: normalizedLines.length,
      cleaned_line_count: deduped.length,
      removed_line_count: Math.max(normalizedLines.length - deduped.length, 0)
    }
  };
}
