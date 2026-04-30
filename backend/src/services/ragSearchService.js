import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";
import { buildRagSearchProfilePrompt } from "../utils/ragPrompt.js";
import { buildTfidfIndex, searchByTfidf } from "../utils/tfidf.js";
import { queryVectorRecords } from "./chromaService.js";
import { createEmbedding, generateJson } from "./openaiService.js";
import { getRagChunksByVectorIds, listRagCasesForKeywordSearch } from "./ragRepository.js";

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePlainText(value, maxLength = 4000) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeKey(value) {
  return normalizePlainText(value, 200).toLowerCase();
}

function buildBigramSet(text) {
  const normalized = normalizePlainText(text, 4000)
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!normalized) {
    return new Set();
  }

  if (normalized.length === 1) {
    return new Set([normalized]);
  }

  const set = new Set();

  for (let index = 0; index < normalized.length - 1; index += 1) {
    set.add(normalized.slice(index, index + 2));
  }

  return set;
}

function calcJaccard(a, b) {
  const setA = buildBigramSet(a);
  const setB = buildBigramSet(b);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function distanceToSimilarity(distance) {
  if (typeof distance !== "number") {
    return 0.5;
  }

  return 1 / (1 + Math.max(distance, 0));
}

function normalizeScoreList(items, key = "score") {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return [];
  }

  const values = list.map((item) => Number(item?.[key]) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);

  if (max === min) {
    return list.map((item) => ({ ...item, normalized_score: max > 0 ? 1 : 0 }));
  }

  return list.map((item) => ({
    ...item,
    normalized_score: ((Number(item?.[key]) || 0) - min) / (max - min)
  }));
}

function normalizeSearchInput(payload = {}) {
  return {
    query: normalizePlainText(payload.query ?? payload.problemStatement ?? "", 4000),
    product: normalizePlainText(payload.product, 120),
    issue_type: normalizePlainText(
      payload.issueType ?? payload.issue_type ?? payload.problemType ?? payload.problem_type,
      120
    ),
    problem_type: normalizePlainText(
      payload.problemType ?? payload.problem_type ?? payload.issueType ?? payload.issue_type,
      120
    ),
    process: normalizePlainText(payload.process, 120),
    problem: normalizePlainText(payload.problem ?? payload.problemStatement, 2000),
    root_cause: normalizePlainText(payload.rootCause ?? payload.rootCauseHint, 2000),
    solution: normalizePlainText(payload.solution, 2000),
    style_terms: Array.isArray(payload.styleTerms ?? payload.style_terms)
      ? (payload.styleTerms ?? payload.style_terms)
          .map((item) => normalizePlainText(item, 80))
          .filter(Boolean)
      : [],
    enableLlmRerank: String(payload.enableLlmRerank ?? "true")
      .trim()
      .toLowerCase() !== "false",
    llmRerankTopK: clamp(Number.parseInt(payload.llmRerankTopK, 10) || 8, 3, 12),
    tfidfRecallLimit: clamp(Number.parseInt(payload.tfidfRecallLimit, 10) || 30, 5, 80),
    hybridEmbeddingWeight: clamp(Number.parseFloat(payload.hybridEmbeddingWeight) || 0.65, 0, 1),
    hybridTfidfWeight: clamp(Number.parseFloat(payload.hybridTfidfWeight) || 0.35, 0, 1),
    recallLimit: clamp(
      Number.parseInt(payload.recallLimit, 10) || env.ragRecallLimit,
      5,
      30
    ),
    limit: clamp(Number.parseInt(payload.limit, 10) || env.ragTopCaseLimit, 1, 10)
  };
}

async function enrichSearchProfile(input) {
  const queryText = [
    input.query,
    input.product ? `产品: ${input.product}` : "",
    input.problem_type ? `问题类型: ${input.problem_type}` : "",
    input.process ? `工序: ${input.process}` : "",
    input.problem ? `问题: ${input.problem}` : "",
    input.root_cause ? `根因线索: ${input.root_cause}` : "",
    input.solution ? `解决方案: ${input.solution}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  if (!queryText) {
    throw httpError(400, "query or problemStatement is required");
  }

  const hasStructuredFields = Boolean(
    input.product || input.problem_type || input.process || input.problem || input.root_cause
  );

  if (hasStructuredFields) {
    return {
      ...input,
      queryText
    };
  }

  try {
    const extracted = await generateJson({
      systemPrompt: "You extract search metadata for enterprise quality retrieval. Return strict JSON only.",
      userPrompt: buildRagSearchProfilePrompt({ query: queryText }),
      temperature: 0
    });

    return {
      ...input,
      product: input.product || normalizePlainText(extracted.product, 120),
      issue_type:
        input.issue_type ||
        normalizePlainText(extracted.issue_type ?? extracted.problem_type, 120),
      problem_type: input.problem_type || normalizePlainText(extracted.problem_type, 120),
      process: input.process || normalizePlainText(extracted.process, 120),
      problem: input.problem || normalizePlainText(extracted.problem, 2000),
      root_cause: input.root_cause || normalizePlainText(extracted.root_cause, 2000),
      solution: input.solution || normalizePlainText(extracted.solution, 2000),
      queryText
    };
  } catch (_error) {
    return {
      ...input,
      queryText
    };
  }
}

function metadataMatch(candidate, expected) {
  if (!expected) {
    return false;
  }

  return normalizeKey(candidate || "") === normalizeKey(expected);
}

function applyMetadataFilter(candidates, profile) {
  const hasProduct = Boolean(profile.product);
  const hasIssueType = Boolean(profile.issue_type || profile.problem_type);
  const hasProcess = Boolean(profile.process);
  const hasFilter = hasProduct || hasIssueType || hasProcess;

  if (!hasFilter) {
    return candidates;
  }

  const strictFiltered = candidates.filter((candidate) => {
    const ragCase = candidate.case;
    const productOk = hasProduct ? metadataMatch(ragCase.product, profile.product) : true;
    const issueTypeOk = hasIssueType
      ? metadataMatch(ragCase.issue_type || ragCase.problem_type, profile.issue_type || profile.problem_type)
      : true;
    const processOk = hasProcess ? metadataMatch(ragCase.process, profile.process) : true;

    return productOk && issueTypeOk && processOk;
  });

  if (strictFiltered.length > 0) {
    return strictFiltered;
  }

  const softFiltered = candidates.filter((candidate) => {
    const ragCase = candidate.case;

    return (
      (hasProduct && metadataMatch(ragCase.product, profile.product)) ||
      (hasIssueType &&
        metadataMatch(
          ragCase.issue_type || ragCase.problem_type,
          profile.issue_type || profile.problem_type
        ))
    );
  });

  if (softFiltered.length >= Math.ceil(candidates.length * 0.25)) {
    return softFiltered;
  }

  const processFiltered = candidates.filter((candidate) =>
    hasProcess ? metadataMatch(candidate.case.process, profile.process) : false
  );

  if (processFiltered.length >= Math.ceil(candidates.length * 0.2)) {
    return processFiltered;
  }

  return candidates;
}

function keywordMatchScore(caseMetadata, profile) {
  const queryTerms = [
    ...profile.style_terms,
    profile.product,
    profile.issue_type,
    profile.problem_type,
    profile.process
  ]
    .map((item) => normalizeKey(item))
    .filter(Boolean);

  const metadataKeywords = [
    ...(Array.isArray(caseMetadata?.keywords) ? caseMetadata.keywords : []),
    ...(Array.isArray(caseMetadata?.term_hints) ? caseMetadata.term_hints : [])
  ]
    .map((item) => normalizeKey(item))
    .filter(Boolean);

  if (queryTerms.length === 0 || metadataKeywords.length === 0) {
    return 0;
  }

  const matched = queryTerms.filter((item) => metadataKeywords.includes(item)).length;
  return matched / Math.max(queryTerms.length, metadataKeywords.length);
}

function styleAffinityScore(candidate, profile) {
  const toneHints = Array.isArray(candidate.case.metadata?.tone_hints)
    ? candidate.case.metadata.tone_hints
    : [];
  const hintText = toneHints.join(" ");
  const problemText = [profile.problem, profile.root_cause, profile.solution].filter(Boolean).join(" ");
  const keywordScore = keywordMatchScore(candidate.case.metadata, profile);
  const hintScore = calcJaccard(problemText, hintText);

  return keywordScore * 0.7 + hintScore * 0.3;
}

function rerankCandidates(candidates, profile) {
  return candidates
    .map((candidate) => {
      const ragCase = candidate.case;
      const vectorScore = distanceToSimilarity(candidate.distance);
      const queryIssueType = profile.issue_type || profile.problem_type;
      const caseIssueType = ragCase.issue_type || ragCase.problem_type;

      const tagScore =
        (metadataMatch(ragCase.product, profile.product) ? 0.4 : 0) +
        (metadataMatch(caseIssueType, queryIssueType) ? 0.4 : 0) +
        (metadataMatch(ragCase.process, profile.process) ? 0.2 : 0);

      const structuredScore =
        calcJaccard(profile.problem, ragCase.problem) * 0.5 +
        calcJaccard(profile.root_cause, ragCase.root_cause) * 0.25 +
        calcJaccard(profile.solution, ragCase.solution) * 0.25;

      const textScore = calcJaccard(profile.queryText, candidate.chunk_text);
      const styleScore = styleAffinityScore(candidate, profile);
      const score =
        tagScore * 0.42 +
        vectorScore * 0.24 +
        structuredScore * 0.16 +
        textScore * 0.1 +
        styleScore * 0.08;

      return {
        ...candidate,
        rerank_score: Number(score.toFixed(6)),
        rerank_detail: {
          vector: Number(vectorScore.toFixed(6)),
          tags: Number(tagScore.toFixed(6)),
          structured: Number(structuredScore.toFixed(6)),
          text: Number(textScore.toFixed(6)),
          style: Number(styleScore.toFixed(6))
        }
      };
    })
    .sort((left, right) => right.rerank_score - left.rerank_score);
}

function compactForLlmRerank(candidates, topK) {
  return candidates.slice(0, topK).map((item, index) => ({
    rank_index: index,
    case_id: item.case_id,
    title: item.case?.title || "",
    product: item.case?.product || "",
    problem_type: item.case?.problem_type || "",
    process: item.case?.process || "",
    problem: item.case?.problem || "",
    root_cause: item.case?.root_cause || "",
    solution: item.case?.solution || "",
    chunk_text: String(item.chunk_text || "").slice(0, 800),
    base_score: item.rerank_score
  }));
}

function buildLlmRerankPrompt(profile, candidates) {
  return [
    "你是企业质量案例检索重排器。请按查询相关性、问题-根因一致性、措施可借鉴性、元数据匹配度，对候选片段重排。",
    "严格输出 JSON：{\"selected\":[{\"rank_index\":number,\"score\":0-1,\"reason\":\"简短中文理由\"}]}",
    "要求：",
    "1. score 越高表示越适合用于生成接近人工报告的 8D 文本。",
    "2. 优先保留问题链路完整、动作对象明确、验证可落地的候选。",
    "3. 避免泛化表达、空话套话。",
    "4. 仅使用提供的候选，不要新增项。",
    "",
    "查询画像：",
    JSON.stringify(
      {
        query: profile.queryText || "",
        product: profile.product || "",
        problem_type: profile.problem_type || "",
        process: profile.process || "",
        problem: profile.problem || "",
        root_cause: profile.root_cause || "",
        solution: profile.solution || ""
      },
      null,
      2
    ),
    "",
    "候选：",
    JSON.stringify(candidates, null, 2)
  ].join("\n");
}

async function rerankWithLlm(candidates, profile, topK) {
  if (candidates.length <= 1) {
    return candidates;
  }

  const compact = compactForLlmRerank(candidates, topK);

  try {
    const result = await generateJson({
      systemPrompt: "You rerank enterprise retrieval candidates. Return strict JSON only.",
      userPrompt: buildLlmRerankPrompt(profile, compact),
      temperature: 0
    });

    const selected = Array.isArray(result?.selected) ? result.selected : [];
    const llmScoreByRank = new Map();
    const llmReasonByRank = new Map();

    for (const item of selected) {
      const rankIndex = Number.parseInt(item?.rank_index, 10);
      if (!Number.isFinite(rankIndex)) {
        continue;
      }
      const score = Math.min(Math.max(Number(item?.score) || 0, 0), 1);
      llmScoreByRank.set(rankIndex, score);
      llmReasonByRank.set(rankIndex, String(item?.reason ?? "").trim().slice(0, 160));
    }

    return candidates
      .map((item, index) => {
        if (index >= topK) {
          return item;
        }

        const llmScore = llmScoreByRank.has(index) ? llmScoreByRank.get(index) : 0.5;
        const score = item.rerank_score * 0.72 + llmScore * 0.28;

        return {
          ...item,
          rerank_score: Number(score.toFixed(6)),
          rerank_detail: {
            ...item.rerank_detail,
            llm: Number(llmScore.toFixed(6)),
            llm_reason: llmReasonByRank.get(index) || ""
          }
        };
      })
      .sort((left, right) => right.rerank_score - left.rerank_score);
  } catch (_error) {
    return candidates;
  }
}

function groupByCase(candidates, limit) {
  const grouped = new Map();

  for (const candidate of candidates) {
    const existing = grouped.get(candidate.case_id);

    if (!existing) {
      grouped.set(candidate.case_id, {
        id: candidate.case.id,
        title: candidate.case.title,
        product: candidate.case.product,
        issue_type: candidate.case.issue_type || candidate.case.problem_type,
        problem_type: candidate.case.problem_type,
        process: candidate.case.process,
        problem: candidate.case.problem,
        root_cause: candidate.case.root_cause,
        solution: candidate.case.solution,
        metadata: candidate.case.metadata,
        source: {
          type: candidate.case.source_type,
          name: candidate.case.source_name,
          path: candidate.case.source_path
        },
        score: candidate.rerank_score,
        matched_chunks: [
          {
            chunk_id: candidate.chunk_id,
            chunk_index: candidate.chunk_index,
            text: candidate.chunk_text,
            score: candidate.rerank_score,
            distance: candidate.distance,
            rerank_detail: candidate.rerank_detail
          }
        ]
      });
      continue;
    }

    existing.matched_chunks.push({
      chunk_id: candidate.chunk_id,
      chunk_index: candidate.chunk_index,
      text: candidate.chunk_text,
      score: candidate.rerank_score,
      distance: candidate.distance,
      rerank_detail: candidate.rerank_detail
    });

    existing.matched_chunks.sort((left, right) => right.score - left.score);
    existing.matched_chunks = existing.matched_chunks.slice(0, 2);
    existing.score = Math.max(existing.score, candidate.rerank_score);
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function buildSearchVectorText(profile) {
  return [
    `查询: ${profile.query || profile.problem || ""}`,
    `产品: ${profile.product || "未指定"}`,
    `问题类型: ${profile.problem_type || "未指定"}`,
    `工序: ${profile.process || "未指定"}`,
    `问题描述: ${profile.problem || "未指定"}`,
    `根因线索: ${profile.root_cause || "未指定"}`,
    `解决目标: ${profile.solution || "未指定"}`
  ].join("\n");
}

function caseToHybridText(ragCase) {
  const metadataKeywords = Array.isArray(ragCase?.metadata?.keywords) ? ragCase.metadata.keywords : [];
  const terms = Array.isArray(ragCase?.metadata?.term_hints) ? ragCase.metadata.term_hints : [];
  return [
    ragCase.title,
    ragCase.product,
    ragCase.issue_type || ragCase.problem_type,
    ragCase.process,
    ragCase.problem,
    ragCase.root_cause,
    ragCase.solution,
    metadataKeywords.join(" "),
    terms.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
}

async function recallByTfidf(profile, normalizedInput) {
  const ragCases = await listRagCasesForKeywordSearch(
    {
      product: profile.product,
      issue_type: profile.issue_type || profile.problem_type,
      process: profile.process
    },
    Math.max(normalizedInput.tfidfRecallLimit * 5, 80)
  );

  const docs = ragCases.map((item) => ({
    case_id: item.id,
    text: caseToHybridText(item),
    case: item
  }));

  const tfidfIndex = buildTfidfIndex(docs);
  const tfidfHits = searchByTfidf(tfidfIndex, profile.queryText, normalizedInput.tfidfRecallLimit);

  return tfidfHits.map((hit) => ({
    case_id: hit.case_id,
    case: hit.case,
    tfidf_score: Number(hit.score.toFixed(6))
  }));
}

function fuseHybridCandidates(vectorCandidates, tfidfCandidates, normalizedInput) {
  const vecWeight = normalizedInput.hybridEmbeddingWeight;
  const tfidfWeight = normalizedInput.hybridTfidfWeight;
  const weightSum = vecWeight + tfidfWeight > 0 ? vecWeight + tfidfWeight : 1;
  const finalVecWeight = vecWeight / weightSum;
  const finalTfidfWeight = tfidfWeight / weightSum;

  const byCaseId = new Map();

  const normalizedVector = normalizeScoreList(
    vectorCandidates.map((item) => ({
      ...item,
      score: distanceToSimilarity(item.distance)
    }))
  );
  const normalizedTfidf = normalizeScoreList(
    tfidfCandidates.map((item) => ({
      ...item,
      score: item.tfidf_score
    }))
  );

  for (const item of normalizedVector) {
    const existing = byCaseId.get(item.case_id) || {
      case_id: item.case_id,
      case: item.case,
      vector_score: 0,
      tfidf_score: 0,
      vector_hit: false,
      tfidf_hit: false
    };
    existing.vector_hit = true;
    existing.vector_score = Math.max(existing.vector_score, item.normalized_score || 0);
    byCaseId.set(item.case_id, existing);
  }

  for (const item of normalizedTfidf) {
    const existing = byCaseId.get(item.case_id) || {
      case_id: item.case_id,
      case: item.case,
      vector_score: 0,
      tfidf_score: 0,
      vector_hit: false,
      tfidf_hit: false
    };
    existing.tfidf_hit = true;
    existing.tfidf_score = Math.max(existing.tfidf_score, item.normalized_score || 0);
    byCaseId.set(item.case_id, existing);
  }

  return Array.from(byCaseId.values())
    .map((item) => ({
      ...item,
      hybrid_score:
        item.vector_score * finalVecWeight +
        item.tfidf_score * finalTfidfWeight +
        (item.vector_hit && item.tfidf_hit ? 0.05 : 0)
    }))
    .sort((a, b) => b.hybrid_score - a.hybrid_score);
}

export async function searchRagCases(payload, currentUser) {
  assertAuthedUser(currentUser);

  const normalizedInput = normalizeSearchInput(payload);
  const profile = await enrichSearchProfile(normalizedInput);
  const embedding = await createEmbedding(buildSearchVectorText(profile));
  const recalled = await queryVectorRecords({
    collectionName: env.chromaRagCollection,
    embedding,
    limit: normalizedInput.recallLimit
  });
  const vectorIds = recalled.map((item) => item.id);
  const chunkRows = await getRagChunksByVectorIds(vectorIds);
  const chunkByVectorId = new Map(chunkRows.map((item) => [item.vector_id, item]));
  const mergedCandidates = recalled
    .map((item) => {
      const match = chunkByVectorId.get(item.id);

      if (!match) {
        return null;
      }

      return {
        ...match,
        distance: item.distance,
        vector_document: item.document,
        vector_metadata: item.metadata
      };
    })
    .filter(Boolean);
  const tfidfCandidates = await recallByTfidf(profile, normalizedInput);
  const hybridRankedCases = fuseHybridCandidates(mergedCandidates, tfidfCandidates, normalizedInput);
  const allowedCaseIds = new Set(
    hybridRankedCases
      .slice(0, Math.max(normalizedInput.recallLimit, normalizedInput.limit * 3))
      .map((item) => item.case_id)
  );
  const hybridFilteredCandidates = mergedCandidates.filter((item) => allowedCaseIds.has(item.case_id));

  const filteredCandidates = applyMetadataFilter(hybridFilteredCandidates, profile);
  const rerankedStage1 = rerankCandidates(filteredCandidates, profile);
  const reranked = normalizedInput.enableLlmRerank
    ? await rerankWithLlm(rerankedStage1, profile, normalizedInput.llmRerankTopK)
    : rerankedStage1;
  const items = groupByCase(reranked, normalizedInput.limit);

  return {
    query_profile: {
      query: profile.query,
      product: profile.product,
      issue_type: profile.issue_type || profile.problem_type,
      problem_type: profile.problem_type,
      process: profile.process,
      problem: profile.problem,
      root_cause: profile.root_cause,
      solution: profile.solution
    },
    pipeline: {
      embedding_recalled_chunks: recalled.length,
      tfidf_recalled_cases: tfidfCandidates.length,
      fused_candidates: hybridFilteredCandidates.length,
      recalled_chunks: recalled.length,
      metadata_filtered_chunks: filteredCandidates.length,
      reranked_chunks: reranked.length,
      selected_cases: items.length
    },
    items
  };
}
