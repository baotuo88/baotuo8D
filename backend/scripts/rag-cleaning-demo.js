import { cleanText } from "../src/utils/ragTextCleaner.js";

const raw = `
Confidential
第 1 页 / 共 6 页
2026-04-30 08:10:22

8 D Report


问题描述：终检发现阀体划伤。
问题描述：终检发现阀体划伤。

Root Cause: fixture pin height deviation.

Corrective Action: replace tray and add SOP check item.
Corrective Action: replace tray and add SOP check item.

第 2 页 / 共 6 页
Confidential
`;

const cleaned = cleanText(raw);

console.log("=== 清洗前 ===");
console.log(raw);
console.log("=== 清洗后 ===");
console.log(cleaned.text);
console.log("=== 清洗元数据 ===");
console.log(cleaned.metadata);
