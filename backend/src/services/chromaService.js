import { ChromaClient } from "chromadb";
import { env } from "../config/env.js";

const collectionPromises = new Map();

async function getCollection(collectionName) {
  if (!collectionPromises.has(collectionName)) {
    const client = new ChromaClient({
      path: env.chromaUrl
    });

    collectionPromises.set(
      collectionName,
      client.getOrCreateCollection({
        name: collectionName
      })
    );
  }

  return collectionPromises.get(collectionName);
}

export async function upsertVectorRecords({ collectionName, records }) {
  if (!Array.isArray(records) || records.length === 0) {
    return;
  }

  const collection = await getCollection(collectionName);

  await collection.upsert({
    ids: records.map((record) => record.id),
    documents: records.map((record) => record.document),
    metadatas: records.map((record) => record.metadata),
    embeddings: records.map((record) => record.embedding)
  });
}

export async function queryVectorRecords({ collectionName, embedding, limit = 5, where }) {
  const collection = await getCollection(collectionName);

  const queryPayload = {
    queryEmbeddings: [embedding],
    nResults: limit,
    include: ["documents", "metadatas", "distances"]
  };

  if (where && Object.keys(where).length > 0) {
    queryPayload.where = where;
  }

  const result = await collection.query(queryPayload);

  const ids = result.ids?.[0] ?? [];
  const documents = result.documents?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  return ids.map((id, index) => ({
    id,
    document: documents[index] ?? "",
    metadata: metadatas[index] ?? {},
    distance: distances[index] ?? null
  }));
}

export async function upsertReportVector({ id, document, metadata, embedding }) {
  await upsertVectorRecords({
    collectionName: env.chromaReportCollection,
    records: [{ id, document, metadata, embedding }]
  });
}

export async function querySimilarReports({ embedding, limit = 5, ownerId = "" }) {
  return queryVectorRecords({
    collectionName: env.chromaReportCollection,
    embedding,
    limit,
    where: ownerId ? { ownerId } : undefined
  });
}
