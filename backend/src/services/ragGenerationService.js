import { httpError } from "../utils/httpError.js";
import { renderEightDText } from "../utils/eightDRenderer.js";
import {
  buildRagD2Prompt,
  buildRagD4Prompt,
  buildRagD5Prompt,
  buildRagEightDPrompt,
  buildStyleSummaryPrompt
} from "../utils/ragPrompt.js";
import { recordRagGenerationEvent } from "../utils/metrics.js";
import { createAiGenerationLog } from "./aiLogService.js";
import { generateJson, generateText } from "./openaiService.js";
import { searchRagCases } from "./ragSearchService.js";
import { resolveStyleProfile } from "./writingStyleService.js";

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function normalizeInput(payload = {}) {
  return {
    title: String(payload.title ?? "").trim(),
    styleProfileId: String(payload.styleProfileId ?? payload.style_profile_id ?? "").trim(),
    styleSummary: String(payload.styleSummary ?? payload.style_summary ?? "").trim(),
    product: String(payload.product ?? "").trim(),
    problemType: String(payload.problemType ?? payload.problem_type ?? "").trim(),
    process: String(payload.process ?? "").trim(),
    problemStatement: String(payload.problemStatement ?? payload.query ?? "").trim(),
    impact: String(payload.impact ?? "").trim(),
    rootCauseHint: String(payload.rootCauseHint ?? payload.rootCause ?? "").trim(),
    retrievedCases: Array.isArray(payload.retrievedCases ?? payload.retrieved_cases)
      ? (payload.retrievedCases ?? payload.retrieved_cases)
      : [],
    teamMembers: Array.isArray(payload.teamMembers)
      ? payload.teamMembers.map((item) => String(item).trim()).filter(Boolean)
      : [],
    retrievalOptions:
      payload.retrievalOptions && typeof payload.retrievalOptions === "object"
        ? payload.retrievalOptions
        : {},
    generationOptions:
      payload.generationOptions && typeof payload.generationOptions === "object"
        ? payload.generationOptions
        : {}
  };
}

function toReferenceCases(items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    product: item.product,
    problem_type: item.problem_type,
    process: item.process,
    problem: item.problem,
    root_cause: item.root_cause,
    solution: item.solution,
    matched_chunks: item.matched_chunks.map((chunk) => chunk.text),
    style_hints: item.metadata?.tone_hints ?? [],
    term_hints: item.metadata?.term_hints ?? [],
    rerank_detail: item.matched_chunks?.[0]?.score ?? item.score ?? null
  }));
}

function toNormalizedReferenceCases(items) {
  return items
    .map((item) => ({
      id: String(item?.id ?? "").trim(),
      title: String(item?.title ?? "").trim(),
      product: String(item?.product ?? "").trim(),
      problem_type: String(item?.problem_type ?? item?.problemType ?? "").trim(),
      process: String(item?.process ?? "").trim(),
      problem: String(item?.problem ?? "").trim(),
      root_cause: String(item?.root_cause ?? item?.rootCause ?? "").trim(),
      solution: String(item?.solution ?? "").trim(),
      style_hints: Array.isArray(item?.style_hints ?? item?.styleHints)
        ? (item.style_hints ?? item.styleHints).map((x) => String(x).trim()).filter(Boolean)
        : [],
      term_hints: Array.isArray(item?.term_hints ?? item?.termHints)
        ? (item.term_hints ?? item.termHints).map((x) => String(x).trim()).filter(Boolean)
        : [],
      matched_chunks: Array.isArray(item?.matched_chunks ?? item?.matchedChunks)
        ? (item.matched_chunks ?? item.matchedChunks)
            .map((chunk) => {
              if (typeof chunk === "string") {
                return chunk.trim();
              }

              return String(chunk?.text ?? "").trim();
            })
            .filter(Boolean)
        : []
    }))
    .filter((item) => item.id || item.title || item.problem || item.root_cause || item.solution);
}

async function summarizeWritingStyle(referenceCases) {
  if (referenceCases.length === 0) {
    return "语气专业克制；按问题、根因、措施、闭环顺序展开；措施描述强调责任、时点与验证。";
  }

  const enrichedCases = referenceCases.map((item) => ({
    ...item,
    style_hints: item.style_hints ?? [],
    term_hints: item.term_hints ?? []
  }));

  return generateText({
    systemPrompt: "You summarize enterprise document writing styles in concise Chinese.",
    userPrompt: buildStyleSummaryPrompt({
      cases: enrichedCases
    }),
    temperature: 0.1
  });
}

function mergeStyleSummary(styleProfile, ragStyleSummary) {
  const profileSummary = styleProfile?.summary || styleProfile?.profile_json?.summary || "";

  if (profileSummary && ragStyleSummary) {
    return `${profileSummary}\n${ragStyleSummary}`;
  }

  return profileSummary || ragStyleSummary;
}

function extractAntiTemplateHints(styleProfile, ragStyleSummary) {
  const fromProfile = Array.isArray(styleProfile?.anti_template_rules)
    ? styleProfile.anti_template_rules
    : [];
  const fromSummary = String(ragStyleSummary || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => /避免|不要|禁用|禁写|少用|套话|空话/u.test(item))
    .slice(0, 5);

  return Array.from(new Set([...fromProfile, ...fromSummary])).slice(0, 8);
}

function ensureText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeFiveWhyItems(items) {
  const list = Array.isArray(items) ? items : [];

  return Array.from({ length: 5 }, (_, index) => {
    const item = list[index] ?? {};

    return {
      why_index: index + 1,
      question: ensureText(item.question, `Why${index + 1}`),
      answer: ensureText(item.answer),
      evidence: ensureText(item.evidence)
    };
  });
}

function normalizeHistoricalApplications(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      case_id: ensureText(item?.case_id ?? item?.caseId),
      reference_point: ensureText(item?.reference_point ?? item?.referencePoint),
      applied_to: ensureText(item?.applied_to ?? item?.appliedTo)
    }))
    .filter((item) => item.case_id || item.reference_point || item.applied_to);
}

function normalizeNextActions(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      owner: ensureText(item?.owner),
      action: ensureText(item?.action),
      due_date: ensureText(item?.due_date ?? item?.dueDate),
      verification: ensureText(item?.verification)
    }))
    .filter((item) => item.owner || item.action || item.due_date || item.verification);
}

function ensureHistoricalApplications(report, referenceCases) {
  const normalized = normalizeHistoricalApplications(report?.historical_case_application);

  if (normalized.length > 0) {
    return normalized;
  }

  return referenceCases.slice(0, 3).map((item) => ({
    case_id: ensureText(item.id || item.title),
    reference_point: ensureText(item.root_cause || item.problem || item.solution),
    applied_to: "用于问题判断、根因分析及措施设计"
  }));
}

function normalizeGeneratedReport(report, referenceCases) {
  return {
    title: ensureText(report?.title),
    summary: ensureText(report?.summary),
    d1_team: ensureText(report?.d1_team),
    d2_problem: ensureText(report?.d2_problem),
    d3_containment: ensureText(report?.d3_containment),
    d4_root_cause: ensureText(report?.d4_root_cause),
    d5_corrective_actions: ensureText(report?.d5_corrective_actions),
    d6_implementation: ensureText(report?.d6_implementation),
    d7_preventive_actions: ensureText(report?.d7_preventive_actions),
    d8_recognition: ensureText(report?.d8_recognition),
    five_why_analysis: normalizeFiveWhyItems(report?.five_why_analysis),
    historical_case_application: ensureHistoricalApplications(report, referenceCases),
    next_actions: normalizeNextActions(report?.next_actions),
    risk_level: ["low", "medium", "high"].includes(String(report?.risk_level ?? "").trim())
      ? String(report.risk_level).trim()
      : "medium"
  };
}

function buildFallbackRawReport({ input, referenceCases, d2Text, d4Text, d5Text }) {
  return {
    title: input.title,
    summary: [input.problemStatement, input.impact].filter(Boolean).join("；"),
    d1_team: input.teamMembers.join("、"),
    d2_problem: d2Text || input.problemStatement,
    d3_containment: "已启动遏制措施：隔离相关批次并执行加严复检。",
    d4_root_cause: d4Text || input.rootCauseHint || "根因待进一步验证。",
    d5_corrective_actions: d5Text || "制定纠正措施并明确责任人与时点。",
    d6_implementation: "按计划推进措施落地，并记录执行证据与结果。",
    d7_preventive_actions: "同步修订点检/作业标准，防止同类问题复发。",
    d8_recognition: "对跨部门协同与闭环执行进行复盘与认可。",
    five_why_analysis: [],
    historical_case_application: referenceCases.slice(0, 3).map((item) => ({
      case_id: ensureText(item.id || item.title),
      reference_point: ensureText(item.root_cause || item.problem || item.solution),
      applied_to: "用于问题判断、根因分析及措施设计"
    })),
    next_actions: [],
    risk_level: "medium"
  };
}

function mergeSectionWithHint(value, hint) {
  const section = ensureText(value);
  const sectionHint = ensureText(hint);

  if (!sectionHint) {
    return section;
  }

  if (!section) {
    return sectionHint;
  }

  if (section.includes(sectionHint)) {
    return section;
  }

  return `${sectionHint}\n${section}`.trim();
}

export async function generateEightDFromRag(payload, currentUser) {
  assertAuthedUser(currentUser);
  const startedAt = Date.now();

  const input = normalizeInput(payload);

  if (!input.title || !input.problemStatement) {
    throw httpError(400, "title and problemStatement are required");
  }

  const providedCases = toNormalizedReferenceCases(input.retrievedCases);
  const searchResult =
    providedCases.length > 0
      ? {
          query_profile: null,
          pipeline: {
            recalled_chunks: 0,
            metadata_filtered_chunks: 0,
            reranked_chunks: 0,
            selected_cases: providedCases.length
          },
          items: providedCases.map((item) => ({
            ...item,
            metadata: {},
            source: null,
            score: null,
            matched_chunks: item.matched_chunks.map((text, index) => ({
              chunk_id: "",
              chunk_index: index,
              text,
              score: null,
              distance: null
            }))
          }))
        }
      : await searchRagCases(
          {
            query: [input.title, input.problemStatement, input.impact, input.rootCauseHint]
              .filter(Boolean)
              .join("；"),
            product: input.product,
            issueType: input.problemType,
            problemType: input.problemType,
            process: input.process,
            problem: input.problemStatement,
            rootCause: input.rootCauseHint,
            limit: 3,
            ...input.retrievalOptions
          },
          currentUser
        );
  const referenceCases =
    providedCases.length > 0 ? providedCases : toReferenceCases(searchResult.items);
  const [styleProfile, autoStyleSummary] = await Promise.all([
    resolveStyleProfile(input.styleProfileId, currentUser),
    input.styleSummary ? Promise.resolve(input.styleSummary) : summarizeWritingStyle(referenceCases)
  ]);
  const styleSummary = mergeStyleSummary(styleProfile, autoStyleSummary);
  const antiTemplateHints = extractAntiTemplateHints(styleProfile, autoStyleSummary);
  const applyStyleConstraint = input.generationOptions?.styleConstraintMode !== "off";
  let d2Text = "";
  let d4Text = "";
  let d5Text = "";

  try {
    d2Text = await generateText({
      systemPrompt: "You write enterprise 8D section D2 in Chinese.",
      userPrompt: buildRagD2Prompt({
        input,
        cases: referenceCases
      }),
      temperature: 0.15
    });
    d4Text = await generateText({
      systemPrompt: "You write enterprise 8D section D4 in Chinese.",
      userPrompt: buildRagD4Prompt({
        input,
        cases: referenceCases,
        d2Text
      }),
      temperature: 0.15
    });
    d5Text = await generateText({
      systemPrompt: "You write enterprise 8D section D5 in Chinese.",
      userPrompt: buildRagD5Prompt({
        input,
        cases: referenceCases,
        d2Text,
        d4Text
      }),
      temperature: 0.15
    });
    const userPrompt = buildRagEightDPrompt({
      input,
      styleSummary: applyStyleConstraint ? styleSummary : "",
      styleProfile,
      antiTemplateHints: applyStyleConstraint ? antiTemplateHints : [],
      cases: referenceCases,
      d2Draft: d2Text,
      d4Draft: d4Text,
      d5Draft: d5Text
    });
    let rawReport;
    try {
      rawReport = await generateJson({
        systemPrompt: "You are an enterprise 8D report generator. Return strict JSON only.",
        userPrompt,
        temperature:
          typeof input.generationOptions?.temperature === "number"
            ? input.generationOptions.temperature
            : 0.2
      });
    } catch (_error) {
      rawReport = buildFallbackRawReport({
        input,
        referenceCases,
        d2Text,
        d4Text,
        d5Text
      });
    }
    rawReport.d2_problem = mergeSectionWithHint(rawReport?.d2_problem, d2Text);
    rawReport.d4_root_cause = mergeSectionWithHint(rawReport?.d4_root_cause, d4Text);
    rawReport.d5_corrective_actions = mergeSectionWithHint(rawReport?.d5_corrective_actions, d5Text);
    const report = normalizeGeneratedReport(rawReport, referenceCases);
    const reportText = renderEightDText(report);
    recordRagGenerationEvent("success");

    const generationLog = await createAiGenerationLog({
      user_id: currentUser.id,
      scene: "rag_generation",
      user_input: {
        title: input.title,
        product: input.product,
        issue_type: input.problemType,
        process: input.process,
        problem_statement: input.problemStatement,
        impact: input.impact,
        root_cause_hint: input.rootCauseHint
      },
      retrieval_content: searchResult.items,
      prompt_content: userPrompt,
      ai_output: report,
      report_text: reportText,
      duration_ms: Date.now() - startedAt,
      status: "success"
    });

    return {
      generation_log_id: generationLog?.id || null,
      references: searchResult.items,
      style_profile: styleProfile,
      style_summary: styleSummary,
      anti_template_hints: antiTemplateHints,
      report,
      report_text: reportText
    };
  } catch (error) {
    recordRagGenerationEvent("failed");
    await createAiGenerationLog({
      user_id: currentUser.id,
      scene: "rag_generation",
      user_input: {
        title: input.title,
        product: input.product,
        issue_type: input.problemType,
        process: input.process,
        problem_statement: input.problemStatement,
        impact: input.impact,
        root_cause_hint: input.rootCauseHint
      },
      retrieval_content: searchResult.items,
      prompt_content: [
        "D2 draft:",
        d2Text,
        "",
        "D4 draft:",
        d4Text,
        "",
        "D5 draft:",
        d5Text
      ].join("\n"),
      ai_output: {},
      report_text: "",
      duration_ms: Date.now() - startedAt,
      status: "failed",
      error_message: error?.message || "unknown_error"
    }).catch(() => {});

    throw error;
  }
}

export async function generateEightDFromRagAB(payload, currentUser) {
  const basePayload = {
    ...(payload ?? {}),
    retrievalOptions: {
      ...(payload?.retrievalOptions ?? {}),
      enableLlmRerank: false
    },
    generationOptions: {
      ...(payload?.generationOptions ?? {}),
      styleConstraintMode: "off",
      temperature: 0.35
    }
  };

  const optimizedPayload = {
    ...(payload ?? {}),
    retrievalOptions: {
      ...(payload?.retrievalOptions ?? {}),
      enableLlmRerank:
        String(payload?.retrievalOptions?.enableLlmRerank ?? "true")
          .trim()
          .toLowerCase() !== "false"
    },
    generationOptions: {
      ...(payload?.generationOptions ?? {}),
      styleConstraintMode: "on",
      temperature:
        typeof payload?.generationOptions?.temperature === "number"
          ? payload.generationOptions.temperature
          : 0.2
    }
  };

  const [baseline, optimized] = await Promise.all([
    generateEightDFromRag(basePayload, currentUser),
    generateEightDFromRag(optimizedPayload, currentUser)
  ]);

  return {
    baseline,
    optimized,
    comparison: {
      retrieval: {
        baseline: baseline.references?.map((item) => ({
          id: item.id,
          title: item.title,
          score: item.score,
          matched_chunks: item.matched_chunks?.map((chunk) => ({
            chunk_index: chunk.chunk_index,
            score: chunk.score,
            rerank_detail: chunk.rerank_detail
          }))
        })),
        optimized: optimized.references?.map((item) => ({
          id: item.id,
          title: item.title,
          score: item.score,
          matched_chunks: item.matched_chunks?.map((chunk) => ({
            chunk_index: chunk.chunk_index,
            score: chunk.score,
            rerank_detail: chunk.rerank_detail
          }))
        }))
      },
      report_text: {
        baseline: baseline.report_text,
        optimized: optimized.report_text
      }
    }
  };
}
