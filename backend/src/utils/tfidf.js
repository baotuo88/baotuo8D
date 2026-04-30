function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return normalized.split(" ").filter((token) => token.length >= 2);
}

function termFreq(tokens) {
  const total = tokens.length;
  const tf = new Map();

  if (total === 0) {
    return tf;
  }

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }

  for (const [token, count] of tf.entries()) {
    tf.set(token, count / total);
  }

  return tf;
}

export function buildTfidfIndex(documents) {
  const docs = Array.isArray(documents) ? documents : [];
  const docTokens = docs.map((doc) => tokenize(doc?.text || ""));
  const docTf = docTokens.map((tokens) => termFreq(tokens));

  const df = new Map();
  for (const tokens of docTokens) {
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }

  const docCount = docs.length || 1;
  const idf = new Map();
  for (const [token, count] of df.entries()) {
    idf.set(token, Math.log((1 + docCount) / (1 + count)) + 1);
  }

  return {
    documents: docs,
    idf,
    docTf
  };
}

export function searchByTfidf(index, queryText, limit = 20) {
  const queryTokens = tokenize(queryText);
  const queryTf = termFreq(queryTokens);

  if (queryTokens.length === 0 || !index?.documents?.length) {
    return [];
  }

  const queryWeights = new Map();
  let queryNorm = 0;

  for (const [token, tf] of queryTf.entries()) {
    const idf = index.idf.get(token) || 0;
    const w = tf * idf;
    queryWeights.set(token, w);
    queryNorm += w * w;
  }

  queryNorm = Math.sqrt(queryNorm);
  if (queryNorm === 0) {
    return [];
  }

  const scored = [];

  for (let i = 0; i < index.documents.length; i += 1) {
    const tfMap = index.docTf[i];
    let dot = 0;
    let docNorm = 0;

    for (const [token, tf] of tfMap.entries()) {
      const idf = index.idf.get(token) || 0;
      const dw = tf * idf;
      docNorm += dw * dw;
      if (queryWeights.has(token)) {
        dot += dw * queryWeights.get(token);
      }
    }

    docNorm = Math.sqrt(docNorm);
    if (docNorm === 0 || dot <= 0) {
      continue;
    }

    scored.push({
      ...index.documents[i],
      score: dot / (docNorm * queryNorm)
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(limit, 1));
}
