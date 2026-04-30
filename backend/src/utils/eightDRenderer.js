function normalizeText(value) {
  return String(value ?? "").trim();
}

function renderLines(title, content) {
  const text = normalizeText(content);
  return `${title}\n${text || "未生成"}\n`;
}

function renderList(items, formatter) {
  if (!Array.isArray(items) || items.length === 0) {
    return "未生成";
  }

  return items
    .map((item, index) => formatter(item, index))
    .filter(Boolean)
    .join("\n");
}

export function renderEightDText(report) {
  const sections = [];

  sections.push(`8D报告标题\n${normalizeText(report.title) || "未命名问题"}\n`);
  sections.push(renderLines("摘要", report.summary));
  sections.push(renderLines("D1 团队", report.d1_team));
  sections.push(renderLines("D2 问题描述", report.d2_problem));
  sections.push(renderLines("D3 临时围堵", report.d3_containment));
  sections.push(renderLines("D4 根因分析", report.d4_root_cause));

  const whyText = renderList(report.five_why_analysis, (item, index) => {
    const whyIndex = Number(item?.why_index) || index + 1;
    const question = normalizeText(item?.question);
    const answer = normalizeText(item?.answer);
    const evidence = normalizeText(item?.evidence);

    return `Why${whyIndex}: ${question}\n回答: ${answer}\n依据: ${evidence}`;
  });
  sections.push(`5Why分析\n${whyText}\n`);

  sections.push(renderLines("D5 纠正措施", report.d5_corrective_actions));
  sections.push(renderLines("D6 实施与验证", report.d6_implementation));
  sections.push(renderLines("D7 预防措施", report.d7_preventive_actions));
  sections.push(renderLines("D8 团队表彰与结案", report.d8_recognition));

  const historicalText = renderList(report.historical_case_application, (item) => {
    const caseId = normalizeText(item?.case_id);
    const referencePoint = normalizeText(item?.reference_point);
    const appliedTo = normalizeText(item?.applied_to);

    return `案例 ${caseId || "未标注"}\n借鉴点: ${referencePoint}\n应用位置: ${appliedTo}`;
  });
  sections.push(`历史案例借鉴\n${historicalText}\n`);

  const actionsText = renderList(report.next_actions, (item) => {
    const owner = normalizeText(item?.owner);
    const action = normalizeText(item?.action);
    const dueDate = normalizeText(item?.due_date);
    const verification = normalizeText(item?.verification);

    return `责任人: ${owner}\n动作: ${action}\n完成时点: ${dueDate}\n验证方式: ${verification}`;
  });
  sections.push(`后续动作\n${actionsText}\n`);

  sections.push(`风险等级\n${normalizeText(report.risk_level) || "未评估"}\n`);

  return sections.join("\n").trim();
}
