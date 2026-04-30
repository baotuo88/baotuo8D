import { ROLES } from "../constants/roles.js";
import { httpError } from "../utils/httpError.js";
import { buildWritingStyleLearningPrompt } from "../utils/ragPrompt.js";
import { generateJson } from "./openaiService.js";
import {
  createWritingStyleProfile,
  getLatestWritingStyleProfile,
  getWritingStyleProfileById,
  listWritingStyleProfiles
} from "./writingStyleRepository.js";

const DEFAULT_ANTI_TEMPLATE_RULES = [
  "避免使用“首先、其次、最后”这类教学式展开。",
  "避免使用“综上所述”“通过上述分析”等总结腔。",
  "避免空泛表态，如“高度重视”“积极推进”而没有动作主体。",
  "避免过度完整对称句，保留工程报告的自然断句感。",
  "避免泛化形容词堆叠，如“全面、系统、深入”连续出现。"
];

function assertAuthedUser(user) {
  if (!user?.id || !user?.role) {
    throw httpError(401, "Authentication required");
  }
}

function assertAdmin(user) {
  if (!user?.id || user.role !== ROLES.ADMIN) {
    throw httpError(403, "Only admin can manage writing styles");
  }
}

function normalizeText(value, maxLength = 20000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeShortText(value, fieldName, maxLength = 200) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

  if (!text) {
    throw httpError(400, `${fieldName} is required`);
  }

  return text;
}

function normalizeArray(value, maxItems, itemLimit) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").replace(/\s+/g, " ").trim().slice(0, itemLimit))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeLearningPayload(payload = {}) {
  const reports = Array.isArray(payload.reports)
    ? payload.reports
        .map((item) => {
          if (typeof item === "string") {
            return {
              title: "",
              content: normalizeText(item)
            };
          }

          return {
            title: String(item?.title ?? "").trim().slice(0, 200),
            content: normalizeText(item?.content ?? item?.text ?? "")
          };
        })
        .filter((item) => item.content)
    : [];

  if (reports.length === 0) {
    throw httpError(400, "reports is required");
  }

  return {
    name: normalizeShortText(payload.name ?? "默认写作风格", "name", 120),
    description: String(payload.description ?? "").trim().slice(0, 1000),
    reports
  };
}

function normalizeProfile(rawProfile, payload, currentUser) {
  const lexicon = normalizeArray(rawProfile.lexicon, 12, 80);
  const sentencePatterns = normalizeArray(rawProfile.sentence_patterns, 8, 160);
  const technicalTerms = normalizeArray(rawProfile.technical_terms, 15, 80);
  const styleRules = normalizeArray(rawProfile.style_rules, 8, 180);
  const antiTemplateRules = normalizeArray(rawProfile.anti_template_rules, 8, 180);
  const samplePhrases = normalizeArray(rawProfile.sample_phrases, 8, 120);
  const summary = String(rawProfile.summary ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  return {
    name: payload.name,
    description: payload.description,
    source_count: payload.reports.length,
    lexicon,
    sentence_patterns: sentencePatterns,
    technical_terms: technicalTerms,
    style_rules: styleRules,
    anti_template_rules:
      antiTemplateRules.length > 0 ? antiTemplateRules : DEFAULT_ANTI_TEMPLATE_RULES,
    sample_phrases: samplePhrases,
    profile_json: {
      summary,
      tone_hints: normalizeArray(rawProfile.tone_hints, 8, 100),
      evidence_patterns: normalizeArray(rawProfile.evidence_patterns, 8, 120),
      reports: payload.reports.map((item) => ({
        title: item.title,
        preview: item.content.slice(0, 200)
      }))
    },
    created_by: currentUser.id
  };
}

function fallbackProfile(payload, currentUser) {
  const combinedText = payload.reports.map((item) => item.content).join("\n");
  const candidateTerms = Array.from(
    new Set(
      combinedText
        .match(/[A-Za-z]{2,}|[\u4e00-\u9fa5]{2,8}/g)
        ?.map((item) => item.trim())
        .filter((item) => item.length >= 2) ?? []
    )
  ).slice(0, 12);

  return {
    name: payload.name,
    description: payload.description,
    source_count: payload.reports.length,
    lexicon: candidateTerms.slice(0, 8),
    sentence_patterns: [
      "问题现象先行，后接影响范围或发生批次。",
      "根因描述偏判断句，不做空泛铺垫。",
      "措施描述采用动作+对象+要求的工程写法。"
    ],
    technical_terms: candidateTerms.slice(0, 12),
    style_rules: [
      "优先写事实、数据、对象和动作，不写空泛评价。",
      "用短句交代判断结论，再补充验证或措施。",
      "保留工程报告口吻，避免宣传式修辞。"
    ],
    anti_template_rules: DEFAULT_ANTI_TEMPLATE_RULES,
    sample_phrases: [
      "现场复核未见批量异常。",
      "问题集中出现在终检工位。",
      "临时围堵已于当班完成。"
    ],
    profile_json: {
      summary: "整体偏工程化短句表达，先写问题事实，再写判断与措施，语言克制。",
      tone_hints: ["用语克制", "先事实后判断", "强调验证与闭环"],
      evidence_patterns: ["先写异常现象，再写复核结论", "措施后补验证方式"],
      reports: payload.reports.map((item) => ({
        title: item.title,
        preview: item.content.slice(0, 200)
      }))
    },
    created_by: currentUser.id
  };
}

export async function learnWritingStyle(payload, currentUser) {
  assertAdmin(currentUser);

  const input = normalizeLearningPayload(payload);

  try {
    const extracted = await generateJson({
      systemPrompt:
        "You are a senior enterprise writing analyst. Extract writing style features as strict JSON only.",
      userPrompt: buildWritingStyleLearningPrompt({
        name: input.name,
        reports: input.reports
      }),
      temperature: 0
    });

    const profile = normalizeProfile(extracted, input, currentUser);
    return createWritingStyleProfile(profile);
  } catch (_error) {
    return createWritingStyleProfile(fallbackProfile(input, currentUser));
  }
}

export async function getWritingStyleProfile(profileId, currentUser) {
  assertAuthedUser(currentUser);

  const profile = profileId
    ? await getWritingStyleProfileById(profileId)
    : await getLatestWritingStyleProfile();

  if (!profile) {
    throw httpError(404, "Writing style profile not found");
  }

  return profile;
}

export async function listStyleProfiles(payload, currentUser) {
  assertAuthedUser(currentUser);
  const limit = Math.min(Math.max(Number.parseInt(payload?.limit, 10) || 20, 1), 100);
  return listWritingStyleProfiles(limit);
}

export async function resolveStyleProfile(styleProfileId, currentUser) {
  assertAuthedUser(currentUser);

  if (styleProfileId) {
    return getWritingStyleProfileById(styleProfileId);
  }

  return getLatestWritingStyleProfile();
}

export async function learnWritingStyleFromProcessedDocuments(
  payload,
  processedDocuments,
  currentUser
) {
  assertAdmin(currentUser);

  const reports = Array.isArray(processedDocuments)
    ? processedDocuments
        .filter((item) => item.status === "success")
        .map((item) => ({
          title: item.file_name || "",
          content: String(item.cleaned_text || item.extracted_text || "").trim()
        }))
        .filter((item) => item.content)
    : [];

  if (reports.length === 0) {
    throw httpError(400, "No valid historical reports to learn from");
  }

  return learnWritingStyle(
    {
      name: payload?.name ?? "上传文档风格",
      description: payload?.description ?? "",
      reports
    },
    currentUser
  );
}
