import { chunkTextSemantically } from "../src/utils/semanticChunker.js";
import { buildRagEightDPrompt } from "../src/utils/ragPrompt.js";

const sampleText = `
D2 问题描述：终检工位在 4 月 12 日夜班发现制动阀体外观划伤，集中于 A 线夹具侧，涉及批次 240412A-03 至 240412A-05。
复核显示划伤长度 3~8mm，深度未穿透镀层，但客户端装配阻力增加，存在卡滞风险。

D4 原因分析：对夹具定位块和转运托盘进行点检，发现托盘右侧定位销高度偏差 +0.7mm，导致阀体在转运中与定位块边缘持续摩擦。
进一步追溯设备点检记录，4 月 9 日保养后未执行定位销高度复核，且首件确认表缺少该项检验点。

D5 纠正措施：4 月 12 日当班更换异常托盘并隔离在制品 126 件，100% 外观复检后放行 118 件，8 件返工。
新增《托盘定位销高度复核》点检项，责任人设备工程师李某，每班首件前执行并记录。

D6 验证：连续三班抽检 360 件，未再出现同类划伤；客户端 4 月 15 日到 4 月 20 日装配反馈无卡滞异常。
`;

const chunks = chunkTextSemantically(sampleText, {
  minChars: 160,
  maxChars: 260,
  overlapChars: 40
});

const prompt = buildRagEightDPrompt({
  input: {
    title: "制动阀体终检划伤异常",
    product: "制动阀体",
    problemType: "外观不良",
    process: "终检+转运",
    problemStatement:
      "终检发现阀体划伤，集中于夜班 A 线，影响客户装配顺畅性。",
    impact: "涉及 3 个批次，客户端存在卡滞风险。",
    rootCauseHint: "托盘定位销高度偏差与点检漏项可能相关。",
    teamMembers: ["质量工程师", "设备工程师", "产线班长"]
  },
  styleSummary:
    "语气克制，先写异常事实再写复核结论。\n措施句偏工程化：对象+动作+时点+验证。\n避免空话，结论句直接落风险等级。",
  styleProfile: {
    name: "终检异常闭环风格",
    summary: "短句为主，先现象后判断，措施必须可追踪。",
    lexicon: ["现场复核", "批次隔离", "点检补项", "首件确认", "连续三班验证"],
    sentence_patterns: ["异常现象 + 范围", "复核结果 + 判断", "措施动作 + 责任 + 时点 + 验证"],
    technical_terms: ["定位销高度", "终检工位", "在制品隔离", "首件确认表"],
    style_rules: ["先事实后判断", "措施必须有责任人和验证方式"],
    anti_template_rules: ["避免“首先/其次/最后”", "避免“综上所述”"],
    sample_phrases: ["现场复核未见批量异常", "当班完成隔离与复检"],
    profile_json: {
      tone_hints: ["克制", "工程化"],
      evidence_patterns: ["异常->复核->判断->措施->验证"]
    }
  },
  antiTemplateHints: ["禁止空泛套话", "禁止总分总模板句"],
  cases: [
    {
      id: "case-01",
      title: "阀体转运划伤闭环案例",
      product: "制动阀体",
      problem_type: "外观不良",
      process: "转运",
      problem: "托盘定位偏差导致阀体摩擦划伤",
      root_cause: "定位销高度偏差且点检漏项",
      solution: "更换托盘+补充点检项+首件确认",
      matched_chunks: ["定位销高度偏差 +0.7mm，连续三班验证无复发"],
      style_hints: ["短句判断", "措施闭环"],
      term_hints: ["定位销", "首件确认", "隔离复检"],
      rerank_detail: 0.91
    }
  ]
});

console.log("=== 语义切分结果 ===");
console.log(chunks);
console.log("\n=== 生成提示词片段（前1200字）===");
console.log(prompt.slice(0, 1200));
