import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";
import { cleanText } from "../utils/ragTextCleaner.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt"]);

let pdfParseFn;
let mammothLib;
let wordExtractorInstance;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isSubPath(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

async function getPdfParse() {
  if (!pdfParseFn) {
    const mod = await import("pdf-parse");
    pdfParseFn = mod.default ?? mod;
  }

  return pdfParseFn;
}

async function getMammoth() {
  if (!mammothLib) {
    const mod = await import("mammoth");
    mammothLib = mod.default ?? mod;
  }

  return mammothLib;
}

async function getWordExtractor() {
  if (!wordExtractorInstance) {
    const mod = await import("word-extractor");
    const WordExtractor = mod.default ?? mod;
    wordExtractorInstance = new WordExtractor();
  }

  return wordExtractorInstance;
}

async function extractPdfText(filePath) {
  const pdfParse = await getPdfParse();
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data?.text ?? "";
}

async function extractDocxText(filePath) {
  const mammoth = await getMammoth();
  const result = await mammoth.extractRawText({ path: filePath });
  return result?.value ?? "";
}

async function extractDocText(filePath) {
  const extractor = await getWordExtractor();
  const document = await extractor.extract(filePath);
  return document?.getBody?.() ?? "";
}

async function extractTxtText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function extractByExtension(filePath, extension) {
  if (extension === ".pdf") {
    return extractPdfText(filePath);
  }

  if (extension === ".docx") {
    return extractDocxText(filePath);
  }

  if (extension === ".doc") {
    return extractDocText(filePath);
  }

  if (extension === ".txt") {
    return extractTxtText(filePath);
  }

  throw httpError(400, `Unsupported file extension: ${extension}`);
}

function toErrorMessage(error) {
  if (error?.message) {
    return error.message;
  }

  return "Unknown processing error";
}

function makeSuccessResult({
  source,
  fileName,
  filePath,
  extension,
  rawText,
  cleanedText,
  includeText,
  cleaningMetadata
}) {
  return {
    source,
    file_name: fileName,
    file_path: filePath,
    extension,
    status: "success",
    stats: {
      raw_length: rawText.length,
      cleaned_length: cleanedText.length
    },
    cleaning: cleaningMetadata ?? {},
    extracted_text: includeText ? rawText : undefined,
    cleaned_text: includeText ? cleanedText : undefined
  };
}

function makeErrorResult({ source, fileName, filePath, extension, error }) {
  return {
    source,
    file_name: fileName,
    file_path: filePath,
    extension,
    status: "error",
    error: toErrorMessage(error)
  };
}

async function processSingleFile({
  source,
  filePath,
  fileName,
  includeText = true
}) {
  const extension = path.extname(fileName || filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw httpError(400, `Unsupported file extension: ${extension || "(none)"}`);
  }

  const rawText = await extractByExtension(filePath, extension);
  const cleaned = cleanText(rawText);
  const cleanedText = cleaned.text;

  return makeSuccessResult({
    source,
    fileName,
    filePath,
    extension,
    rawText,
    cleanedText,
    includeText,
    cleaningMetadata: cleaned.metadata
  });
}

export async function processSingleDocument({ source, filePath, fileName, includeText = true }) {
  return processSingleFile({
    source,
    filePath,
    fileName,
    includeText
  });
}

async function processBatch(items, workerFn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await workerFn(items[index], index);
    }
  }

  const size = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: size }, () => runWorker()));

  return results;
}

function summarize(results) {
  const total = results.length;
  const success = results.filter((item) => item.status === "success").length;
  const failed = total - success;

  return {
    total,
    success,
    failed
  };
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (_error) {
    // best effort cleanup
  }
}

export async function processUploadedDocuments(files, options = {}) {
  const includeText = normalizeBoolean(options.includeText, true);
  const concurrency = clamp(env.documentBatchConcurrency, 1, 16);

  if (!Array.isArray(files) || files.length === 0) {
    throw httpError(400, "No files uploaded. Use form-data field 'files'.");
  }

  const results = await processBatch(
    files,
    async (file) => {
      const filePath = file.path;
      const fileName = file.originalname || path.basename(filePath);

      try {
        return await processSingleFile({
          source: "upload",
          filePath,
          fileName,
          includeText
        });
      } catch (error) {
        return makeErrorResult({
          source: "upload",
          fileName,
          filePath,
          extension: path.extname(fileName).toLowerCase(),
          error
        });
      } finally {
        await safeUnlink(filePath);
      }
    },
    concurrency
  );

  return {
    summary: summarize(results),
    results
  };
}

async function walkDirectoryFiles(directoryPath, recursive) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        const nested = await walkDirectoryFiles(fullPath, recursive);
        files.push(...nested);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();

    if (SUPPORTED_EXTENSIONS.has(extension)) {
      files.push({
        filePath: fullPath,
        fileName: entry.name,
        extension
      });
    }
  }

  return files;
}

function resolveImportFolder(inputFolderPath) {
  const folderPath = String(inputFolderPath ?? "").trim();

  if (!folderPath) {
    throw httpError(400, "folderPath is required");
  }

  const rootPath = path.resolve(env.documentImportRoot);
  const candidatePath = path.resolve(
    path.isAbsolute(folderPath) ? folderPath : path.join(rootPath, folderPath)
  );

  if (!isSubPath(candidatePath, rootPath)) {
    throw httpError(403, `folderPath must stay within import root: ${rootPath}`);
  }

  return {
    rootPath,
    folderPath: candidatePath
  };
}

export async function importDocumentsFromFolder(payload = {}) {
  const { rootPath, folderPath } = resolveImportFolder(payload.folderPath);
  const includeText = normalizeBoolean(payload.includeText, true);
  const recursive = normalizeBoolean(payload.recursive, true);
  const concurrency = clamp(env.documentBatchConcurrency, 1, 16);

  const stat = await fs
    .stat(folderPath)
    .catch(() => {
      throw httpError(400, `folderPath does not exist: ${folderPath}`);
    });

  if (!stat.isDirectory()) {
    throw httpError(400, "folderPath must be a directory");
  }

  let files = await walkDirectoryFiles(folderPath, recursive);

  const maxFiles = clamp(env.documentMaxImportFiles, 1, 5000);
  if (files.length > maxFiles) {
    files = files.slice(0, maxFiles);
  }

  if (files.length === 0) {
    return {
      import_root: rootPath,
      folder_path: folderPath,
      recursive,
      summary: {
        total: 0,
        success: 0,
        failed: 0
      },
      results: []
    };
  }

  const results = await processBatch(
    files,
    async (file) => {
      try {
        return await processSingleFile({
          source: "import-folder",
          filePath: file.filePath,
          fileName: file.fileName,
          includeText
        });
      } catch (error) {
        return makeErrorResult({
          source: "import-folder",
          fileName: file.fileName,
          filePath: file.filePath,
          extension: file.extension,
          error
        });
      }
    },
    concurrency
  );

  return {
    import_root: rootPath,
    folder_path: folderPath,
    recursive,
    summary: summarize(results),
    results
  };
}
