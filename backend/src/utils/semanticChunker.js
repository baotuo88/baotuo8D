import { env } from "../config/env.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitOversizedUnit(text, maxChars) {
  const fragments = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let splitAt = -1;
    const probe = remaining.slice(0, maxChars + 1);
    const separators = ["。", "！", "？", "；", "\n", "，", ",", " "];

    for (const separator of separators) {
      const index = probe.lastIndexOf(separator);
      if (index >= Math.floor(maxChars * 0.55)) {
        splitAt = index + 1;
        break;
      }
    }

    if (splitAt <= 0) {
      splitAt = maxChars;
    }

    fragments.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    fragments.push(remaining);
  }

  return fragments.filter(Boolean);
}

function isHeadingLike(text) {
  const normalized = String(text ?? "").trim();

  if (!normalized) {
    return false;
  }

  return /^(d[1-8]\b|[一二三四五六七八九十]+[、.]|[0-9]+[、.]|问题描述|原因分析|临时措施|纠正措施|预防措施|结论|对策|验证)/iu.test(
    normalized
  );
}

function splitToSemanticUnits(text, maxChars) {
  const paragraphUnits = normalizeText(text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const units = [];

  for (const paragraph of paragraphUnits) {
    if (paragraph.length <= maxChars) {
      units.push(paragraph);
      continue;
    }

    const sentenceUnits = paragraph
      .split(/(?<=[。！？；.!?;])\s*/u)
      .map((item) => item.trim())
      .filter(Boolean);

    if (sentenceUnits.length <= 1) {
      units.push(...splitOversizedUnit(paragraph, maxChars));
      continue;
    }

    for (const sentence of sentenceUnits) {
      if (sentence.length <= maxChars) {
        units.push(sentence);
        continue;
      }

      units.push(...splitOversizedUnit(sentence, maxChars));
    }
  }

  return units;
}

function splitLeadingHeading(unit) {
  const text = String(unit ?? "").trim();
  if (!text) {
    return [];
  }

  const match = text.match(
    /^(d[1-8]\b[^：:\n]{0,30}|[一二三四五六七八九十]+[、.][^\n]{0,20}|[0-9]+[、.][^\n]{0,20}|问题描述|原因分析|临时措施|纠正措施|预防措施|结论|对策|验证)\s*[：:]?/iu
  );

  if (!match) {
    return [text];
  }

  const heading = match[0].trim();
  const remain = text.slice(match[0].length).trim();
  return remain ? [heading, remain] : [heading];
}

function semanticBoundaryWeight(unit) {
  let weight = 1;
  const text = String(unit ?? "").trim();

  if (!text) {
    return 0;
  }

  if (isHeadingLike(text)) {
    weight += 1.4;
  }

  if (/根因|原因|对策|措施|验证|围堵|预防|结论|复盘/u.test(text)) {
    weight += 0.4;
  }

  if (/：|:/u.test(text.slice(0, 18))) {
    weight += 0.3;
  }

  return weight;
}

export function chunkTextSemantically(text, options = {}) {
  const minChars = clamp(
    Number.parseInt(options.minChars, 10) || env.ragChunkMinChars,
    100,
    2000
  );
  const maxChars = clamp(
    Number.parseInt(options.maxChars, 10) || env.ragChunkMaxChars,
    minChars,
    3000
  );
  const rawUnits = splitToSemanticUnits(text, maxChars);
  const units = rawUnits.flatMap((item) => splitLeadingHeading(item));

  if (units.length === 0) {
    return [];
  }

  const chunks = [];
  let buffer = "";
  let bufferWeight = 0;

  function pushBuffer() {
    const chunkText = buffer.trim();

    if (!chunkText) {
      return;
    }

    chunks.push({
      text: chunkText,
      charCount: chunkText.length
    });

    buffer = "";
    bufferWeight = 0;
  }

  for (const unit of units) {
    if (isHeadingLike(unit) && buffer.length >= Math.floor(minChars * 0.85)) {
      pushBuffer();
    }

    const next = buffer ? `${buffer}\n${unit}` : unit;
    const unitWeight = semanticBoundaryWeight(unit);

    if (next.length <= maxChars && bufferWeight + unitWeight <= 4.5) {
      buffer = next;
      bufferWeight += unitWeight;
      continue;
    }

    if (buffer.length >= minChars) {
      pushBuffer();
      buffer = unit;
      bufferWeight = unitWeight;
      continue;
    }

    const merged = next.slice(0, maxChars).trim();
    buffer = merged;
    pushBuffer();
    const remainder = next.slice(maxChars).trim();
    buffer = remainder;
    bufferWeight = semanticBoundaryWeight(remainder);
  }

  pushBuffer();

  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];

    if (last.charCount < minChars * 0.6 && previous.charCount + last.charCount <= maxChars * 1.2) {
      previous.text = `${previous.text}\n${last.text}`.trim();
      previous.charCount = previous.text.length;
      chunks.pop();
    }
  }

  const overlapChars = clamp(
    Number.parseInt(options.overlapChars, 10) || Math.floor(minChars * 0.25),
    0,
    Math.floor(maxChars * 0.4)
  );
  const withOverlap = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const current = chunks[index];
    const prev = chunks[index - 1];
    const currentText = current.text;

    if (!prev || overlapChars <= 0) {
      withOverlap.push({
        index,
        text: currentText,
        charCount: currentText.length
      });
      continue;
    }

    const overlap = prev.text.slice(-overlapChars).trim();
    const merged = overlap ? `${overlap}\n${currentText}` : currentText;
    withOverlap.push({
      index,
      text: merged,
      charCount: merged.length
    });
  }

  return withOverlap;
}
