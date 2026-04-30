function formatArray(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "[]";
  }

  return JSON.stringify(items, null, 2);
}

export function buildRagCaseExtractionPrompt({ sourceName, text }) {
  return [
    "请从企业质量案例文本中提取结构化信息，严格输出 JSON。",
    "字段必须包含：title, product, issue_type, process, problem, root_cause, solution, keywords, tone_hints, term_hints。",
    "要求：",
    "1. 所有字段都使用中文字符串，未知时返回空字符串。",
    "2. keywords 必须为数组，最多 8 个短语。",
    "3. tone_hints 总结该案例的表达风格特征，最多 6 条短语。",
    "4. term_hints 总结该案例中高频专业术语，最多 8 条。",
    "5. 不要虚构文本中没有出现的具体数字或结论。",
    "",
    `来源文件: ${sourceName || "未命名文档"}`,
    "案例文本：",
    text
  ].join("\n");
}

export function buildRagSearchProfilePrompt({ query }) {
  return [
    "请从检索请求中提取质量问题画像，严格输出 JSON。",
    "字段必须包含：product, issue_type, process, problem, root_cause, solution。",
    "未知时返回空字符串，不要补充解释。",
    "",
    "检索请求：",
    query
  ].join("\n");
}

export function buildStyleSummaryPrompt({ cases }) {
  return [
    "请总结以下历史质量案例的写作风格。",
    "输出 4 到 6 行中文，每行一个要点，不要输出标题，不要输出 Markdown 列表符号。",
    "重点总结：语气、结构、证据表达、措施描述、结论收束方式、避免套话的表达特征。",
    "",
    "历史案例：",
    formatArray(cases)
  ].join("\n");
}

export function buildWritingStyleLearningPrompt({ name, reports }) {
  return [
    "请学习以下历史报告的写作风格，严格输出 JSON。",
    "字段必须包含：lexicon, sentence_patterns, technical_terms, style_rules, anti_template_rules, sample_phrases, tone_hints, evidence_patterns, summary。",
    "要求：",
    "1. lexicon：提炼常见用词或搭配，6到12条，短语级别。",
    "2. sentence_patterns：提炼常见句式，4到8条，用模板化描述句法骨架，不要照抄整段。",
    "3. technical_terms：提炼专业术语，6到15条。",
    "4. style_rules：总结人工报告常见表达习惯，4到8条。",
    "5. anti_template_rules：列出应避免的 AI 模板语言，4到8条。",
    "6. sample_phrases：提炼可复用的人写法短句，4到8条。",
    "7. tone_hints：总结整体语气和行文密度，3到6条。",
    "8. evidence_patterns：总结如何呈现事实、复核、验证和结论，3到6条。",
    "9. 所有内容必须贴近企业质量/8D报告，不要泛泛而谈。",
    "10. 不要输出 Markdown，不要解释。",
    "",
    `风格名称: ${name || "默认风格"}`,
    "历史报告：",
    formatArray(reports)
  ].join("\n");
}

function formatStyleProfile(styleProfile) {
  if (!styleProfile) {
    return "未提供显式风格画像。";
  }

  return JSON.stringify(
    {
      name: styleProfile.name || "",
      summary: styleProfile.summary || "",
      lexicon: styleProfile.lexicon || [],
      sentence_patterns: styleProfile.sentence_patterns || [],
      technical_terms: styleProfile.technical_terms || [],
      style_rules: styleProfile.style_rules || [],
      anti_template_rules: styleProfile.anti_template_rules || [],
      sample_phrases: styleProfile.sample_phrases || [],
      tone_hints: styleProfile.profile_json?.tone_hints || [],
      evidence_patterns: styleProfile.profile_json?.evidence_patterns || []
    },
    null,
    2
  );
}

export function buildRagEightDPrompt({
  input,
  styleSummary,
  styleProfile,
  antiTemplateHints,
  cases,
  d2Draft = "",
  d4Draft = "",
  d5Draft = ""
}) {
  const teamMembers = Array.isArray(input.teamMembers)
    ? input.teamMembers.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return [
    "你是企业质量工程与 8D 改善专家，需要结合历史案例生成高质量、可落地的结构化 8D 报告。",
    "严格输出 JSON，不要输出多余文本。",
    "JSON 字段必须包含：",
    "title, summary, d1_team, d2_problem, d3_containment, d4_root_cause, d5_corrective_actions, d6_implementation, d7_preventive_actions, d8_recognition, five_why_analysis, historical_case_application, next_actions, risk_level",
    "其中：",
    "1. next_actions 必须是数组，元素为对象，字段包含 owner, action, due_date, verification。",
    "2. risk_level 只能是 low、medium、high。",
    "3. five_why_analysis 必须是长度为5的数组，每项包含 why_index, question, answer, evidence。",
    "4. historical_case_application 必须是数组，每项包含 case_id, reference_point, applied_to。",
    "要求：",
    "1. 必须参考历史案例。至少在问题界定、根因判断、措施设计三个环节体现历史案例借鉴点，并写入 historical_case_application。",
    "2. 必须模仿提供的写作风格，优先使用风格画像中的常用词、句式和专业术语，但不要机械拼接。",
    "3. 禁止泛化表达。不要写“加强管理”“持续优化”“举一反三”“全面排查”这类没有对象、动作、范围、责任或验证方式的空话。",
    "4. 必须包含完整 5Why 分析，层层递进，不得跳步，最终落到可执行根因。",
    "5. 优先使用输入事实，历史案例仅作为结构、措辞和措施参考，不能编造输入中没有的具体数值。",
    "6. 内容要适合企业内部 8D 文档，表达明确、可执行、可追踪。",
    "7. 避免 AI 模板语言，例如“首先/其次/最后”“综上所述”“需要指出的是”“值得注意的是”“通过上述分析”等空泛套话。",
    "8. 句子长短要有变化，允许适度使用企业内部常见短句、判断句、处理结论句，不要每段都一个套路。",
    "9. D4 必须体现根因链路，D5-D7 必须体现措施、验证、预防的闭环关系。",
    "10. 尽量采用人工报告习惯：先写现象，再写复核，再写判断；少用宏大形容词，多用对象、动作、范围、责任、验证。",
    "11. 每个 D 段至少包含一个“对象+动作+范围/条件+验证方式”句式，不可只写原则。",
    "12. summary 不要写成总分总模板；必须直接给出异常事实、处理结论和当前风险判断。",
    "13. 已提供 D2/D4/D5 草稿时，必须保持技术结论一致，不得偏离因果链路。",
    "",
    "历史写作风格：",
    styleSummary || "语气专业、结构清晰、强调闭环。",
    "",
    "反模板表达约束：",
    formatArray(antiTemplateHints || []),
    "",
    "学习到的风格画像：",
    formatStyleProfile(styleProfile),
    "",
    "可参考历史案例：",
    formatArray(cases),
    "",
    "当前待生成问题：",
    JSON.stringify(
      {
        title: input.title ?? "",
        product: input.product ?? "",
        problem_type: input.problemType ?? "",
        process: input.process ?? "",
        problemStatement: input.problemStatement ?? "",
        impact: input.impact ?? "",
        rootCauseHint: input.rootCauseHint ?? "",
        teamMembers
      },
      null,
      2
    ),
    "",
    "分步生成草稿：",
    JSON.stringify(
      {
        d2_problem_draft: d2Draft || "",
        d4_root_cause_draft: d4Draft || "",
        d5_corrective_actions_draft: d5Draft || ""
      },
      null,
      2
    )
  ].join("\n");
}

export function buildRagD2Prompt({ input, cases }) {
  return [
    "你是企业质量工程师。请只生成 D2（问题描述）。",
    "输出要求：纯文本，不要 JSON，不要标题，不要分点序号。",
    "内容必须包含：异常现象、发生范围、时间线或批次线索、影响与风险。",
    "避免空话，使用对象+动作+范围+验证方式。",
    "",
    "输入问题：",
    JSON.stringify(
      {
        title: input.title ?? "",
        product: input.product ?? "",
        process: input.process ?? "",
        problemStatement: input.problemStatement ?? "",
        impact: input.impact ?? ""
      },
      null,
      2
    ),
    "",
    "参考案例：",
    formatArray(cases)
  ].join("\n");
}

export function buildRagD4Prompt({ input, cases, d2Text }) {
  return [
    "你是企业质量工程师。请只生成 D4（根因分析）。",
    "输出要求：纯文本，不要 JSON。",
    "必须基于 D2 现象，给出因果链路，并包含简洁 5Why 递进思路。",
    "必须明确可验证根因，禁止泛化语言。",
    "",
    "输入问题：",
    JSON.stringify(
      {
        title: input.title ?? "",
        product: input.product ?? "",
        process: input.process ?? "",
        rootCauseHint: input.rootCauseHint ?? ""
      },
      null,
      2
    ),
    "",
    "已生成 D2：",
    d2Text || "",
    "",
    "参考案例：",
    formatArray(cases)
  ].join("\n");
}

export function buildRagD5Prompt({ input, cases, d2Text, d4Text }) {
  return [
    "你是企业质量工程师。请只生成 D5（纠正措施）。",
    "输出要求：纯文本，不要 JSON。",
    "必须与 D4 根因一一对应，包含措施对象、执行动作、责任与验证方式。",
    "措施需可执行、可追踪，避免口号式表达。",
    "",
    "输入问题：",
    JSON.stringify(
      {
        title: input.title ?? "",
        product: input.product ?? "",
        process: input.process ?? ""
      },
      null,
      2
    ),
    "",
    "已生成 D2：",
    d2Text || "",
    "",
    "已生成 D4：",
    d4Text || "",
    "",
    "参考案例：",
    formatArray(cases)
  ].join("\n");
}
