export function buildEightDPrompt(input) {
  const teamMembers = Array.isArray(input.teamMembers)
    ? input.teamMembers.filter(Boolean)
    : [];

  return [
    "你是企业质量管理专家，需要生成结构化8D报告。",
    "严格输出 JSON，不要输出多余文本。",
    "JSON字段必须包含：",
    "title, summary, d1_team, d2_problem, d3_containment, d4_root_cause, d5_corrective_actions, d6_implementation, d7_preventive_actions, d8_recognition, next_actions(数组), risk_level",
    "风险等级 risk_level 只能是：low、medium、high。",
    "",
    "输入信息：",
    `- 问题标题: ${input.title ?? "未提供"}`,
    `- 问题描述: ${input.problemStatement ?? "未提供"}`,
    `- 业务影响: ${input.impact ?? "未提供"}`,
    `- 根因线索: ${input.rootCauseHint ?? "未提供"}`,
    `- 团队成员: ${teamMembers.length ? teamMembers.join("、") : "未提供"}`
  ].join("\n");
}
