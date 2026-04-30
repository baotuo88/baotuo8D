import path from "path";
import { randomUUID } from "crypto";
import { env } from "../config/env.js";
import { ROLES } from "../constants/roles.js";
import { httpError } from "../utils/httpError.js";
import { buildRagCaseExtractionPrompt } from "../utils/ragPrompt.js";
import { chunkTextSemantically } from "../utils/semanticChunker.js";
import { upsertVectorRecords } from "./chromaService.js";
import { createEmbeddings, generateJson } from "./openaiService.js";
import { createRagCaseWithChunks, deleteRagCaseById } from "./ragRepository.js";

const EXTRACTION_TEXT_LIMIT = 12000;

function assertAdmin(user) {
  if (!user?.id || user.role !== ROLES.ADMIN) {
    throw httpError(403, "Only admin can import RAG cases");
  }
}

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeField(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fallbackTitle(sourceName, text) {
  const normalizedName = normalizeField(path.basename(sourceName || ""), 200);

  if (normalizedName) {
    return normalizedName.replace(/\.[^.]+$/, "");
  }

  return normalizeField(text.slice(0, 60), 60);
}

async function extractCaseProfile({ sourceName, normalizedText }) {
  const truncatedText = normalizedText.slice(0, EXTRACTION_TEXT_LIMIT);

  try {
    const extracted = await generateJson({
      systemPrompt: "You extract structured enterprise quality case fields. Return strict JSON only.",
      userPrompt: buildRagCaseExtractionPrompt({
        sourceName,
        text: truncatedText
      }),
      temperature: 0
    });

    return {
      title: normalizeField(extracted.title, 200) || fallbackTitle(sourceName, normalizedText),
      product: normalizeField(extracted.product, 120),
      issue_type: normalizeField(extracted.issue_type ?? extracted.problem_type, 120),
      problem_type: normalizeField(extracted.problem_type, 120),
      process: normalizeField(extracted.process, 120),
      problem: normalizeField(extracted.problem, 4000),
      root_cause: normalizeField(extracted.root_cause, 4000),
      solution: normalizeField(extracted.solution, 4000),
      keywords: Array.isArray(extracted.keywords)
        ? extracted.keywords.map((item) => normalizeField(item, 80)).filter(Boolean).slice(0, 8)
        : []
    };
  } catch (_error) {
    return {
      title: fallbackTitle(sourceName, normalizedText),
      product: "",
      issue_type: "",
      problem_type: "",
      process: "",
      problem: normalizeField(normalizedText.slice(0, 300), 300),
      root_cause: "",
      solution: "",
      keywords: []
    };
  }
}

function buildChunkMetadata({ ragCase, chunk, sourceName }) {
  return {
    caseId: ragCase.id,
    chunkIndex: chunk.index,
    title: ragCase.title,
    product: ragCase.product,
    issueType: ragCase.issue_type,
    problemType: ragCase.problem_type,
    process: ragCase.process,
    sourceName: sourceName || "",
    problem: ragCase.problem,
    rootCause: ragCase.root_cause,
    solution: ragCase.solution,
    keywords: ragCase.metadata?.keywords ?? [],
    toneHints: ragCase.metadata?.tone_hints ?? [],
    termHints: ragCase.metadata?.term_hints ?? []
  };
}

function toChunkVectorText({ ragCase, chunk }) {
  return [
    `标题: ${ragCase.title}`,
    `产品: ${ragCase.product || "未标注"}`,
    `问题标签: ${ragCase.issue_type || "未标注"}`,
    `问题类型: ${ragCase.problem_type || "未标注"}`,
    `工序: ${ragCase.process || "未标注"}`,
    `问题: ${ragCase.problem || "未提取"}`,
    `根因: ${ragCase.root_cause || "未提取"}`,
    `解决方案: ${ragCase.solution || "未提取"}`,
    `正文片段: ${chunk.text}`
  ].join("\n");
}

function assertMandatoryTags({ sourceName, profile }) {
  if (profile.product && profile.issue_type && profile.process) {
    return;
  }

  throw httpError(
    400,
    `Document ${sourceName} missing mandatory tags: product / issue_type / process`
  );
}

async function indexSingleDocument(document, currentUser) {
  const sourceName = document.file_name || document.source_name || "document";
  const sourcePath = document.file_path || "";
  const normalizedText = normalizeText(document.cleaned_text || document.text || "");

  if (!normalizedText) {
    throw httpError(400, `Document ${sourceName} has no usable text`);
  }

  const profile = await extractCaseProfile({
    sourceName,
    normalizedText
  });
  assertMandatoryTags({ sourceName, profile });

  const chunks = chunkTextSemantically(normalizedText, {
    minChars: env.ragChunkMinChars,
    maxChars: env.ragChunkMaxChars
  });

  if (chunks.length === 0) {
    throw httpError(400, `Document ${sourceName} could not be chunked`);
  }

  const caseMetadata = {
    product: profile.product,
    issue_type: profile.issue_type,
    problem_type: profile.problem_type,
    process: profile.process,
    keywords: profile.keywords,
    tone_hints: profile.tone_hints ?? [],
    term_hints: profile.term_hints ?? [],
      source_name: sourceName
  };

  const vectorIds = chunks.map(() => randomUUID());
  const chunkRecords = chunks.map((chunk, index) => ({
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    char_count: chunk.charCount,
    vector_id: vectorIds[index],
    metadata: {
      ...caseMetadata,
      chunk_index: chunk.index
    }
  }));

  const { ragCase, chunks: insertedChunks } = await createRagCaseWithChunks({
    caseRecord: {
      source_type: "document",
      source_name: sourceName,
      source_path: sourcePath,
      title: profile.title,
      product: profile.product,
      issue_type: profile.issue_type,
      problem_type: profile.problem_type,
      process: profile.process,
      problem: profile.problem,
      root_cause: profile.root_cause,
      solution: profile.solution,
      metadata: caseMetadata,
      raw_text: String(document.extracted_text || normalizedText),
      normalized_text: normalizedText,
      created_by: currentUser.id
    },
    chunks: chunkRecords
  });

  const vectorTexts = chunks.map((chunk) =>
    toChunkVectorText({
      ragCase,
      chunk
    })
  );
  const embeddings = await createEmbeddings(vectorTexts);

  try {
    await upsertVectorRecords({
      collectionName: env.chromaRagCollection,
      records: insertedChunks.map((chunk, index) => ({
        id: chunk.vector_id,
        document: vectorTexts[index],
        metadata: buildChunkMetadata({
          ragCase,
          chunk: chunks[index],
          sourceName
        }),
        embedding: embeddings[index]
      }))
    });
  } catch (error) {
    await deleteRagCaseById(ragCase.id);
    throw error;
  }

  return {
    case_id: ragCase.id,
    title: ragCase.title,
    product: ragCase.product,
    issue_type: ragCase.issue_type,
    problem_type: ragCase.problem_type,
    process: ragCase.process,
    chunk_count: insertedChunks.length,
    source_name: sourceName
  };
}

export async function ingestProcessedDocuments(processingResult, currentUser) {
  assertAdmin(currentUser);

  const items = Array.isArray(processingResult?.results) ? processingResult.results : [];
  const results = [];

  for (const item of items) {
    if (item.status !== "success") {
      results.push({
        source_name: item.file_name ?? "document",
        status: "error",
        error: item.error || "Document processing failed"
      });
      continue;
    }

    try {
      const indexed = await indexSingleDocument(item, currentUser);
      results.push({
        source_name: item.file_name,
        status: "success",
        data: indexed
      });
    } catch (error) {
      results.push({
        source_name: item.file_name,
        status: "error",
        error: error.message || "RAG indexing failed"
      });
    }
  }

  return {
    summary: {
      total: results.length,
      success: results.filter((item) => item.status === "success").length,
      failed: results.filter((item) => item.status === "error").length
    },
    results
  };
}
