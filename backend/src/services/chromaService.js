import { ChromaClient } from "chromadb";
import { env } from "../config/env.js";

const collectionPromises = new Map();
const collectionNameAliases = new Map();

function isCollectionNotFoundError(error) {
  if (!error) {
    return false;
  }

  const status = Number(error?.status ?? error?.statusCode ?? 0);
  if (status === 404) {
    return true;
  }

  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}

function isCollectionMetadataTypeError(error) {
  const message = String(error?.message ?? "");
  return message.includes("KeyError('_type')");
}

async function getOrCreateByName(client, name) {
  try {
    return await client.getCollection({ name });
  } catch (error) {
    if (!isCollectionNotFoundError(error)) {
      throw error;
    }

    return client.createCollection({ name });
  }
}

async function getCollection(collectionName) {
  const requestedName = String(collectionName);
  const aliasedName = collectionNameAliases.get(requestedName);
  const effectiveName = aliasedName || requestedName;

  if (!collectionPromises.has(effectiveName)) {
    const client = new ChromaClient({
      path: env.chromaUrl
    });

    const promise = (async () => {
      try {
        return await getOrCreateByName(client, effectiveName);
      } catch (error) {
        if (!isCollectionMetadataTypeError(error) || effectiveName !== requestedName) {
          throw error;
        }

        const compatName = `${requestedName}__compat`;
        collectionNameAliases.set(requestedName, compatName);
        return getOrCreateByName(client, compatName);
      }
    })();

    collectionPromises.set(effectiveName, promise);
  }

  const resolvedName = collectionNameAliases.get(requestedName) || effectiveName;
  if (resolvedName !== effectiveName && !collectionPromises.has(resolvedName)) {
    const client = new ChromaClient({
      path: env.chromaUrl
    });

    collectionPromises.set(resolvedName, getOrCreateByName(client, resolvedName));
  }

  const promiseKey = collectionNameAliases.get(requestedName) || effectiveName;
  const promise = collectionPromises.get(promiseKey);

  if (!promise) {
    throw new Error(`Failed to resolve Chroma collection: ${requestedName}`);
  }

  try {
    return await promise;
  } catch (error) {
    collectionPromises.delete(promiseKey);
    if (promiseKey !== requestedName) {
      collectionNameAliases.delete(requestedName);
    }
    throw error;
  }
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
  let collection;
  try {
    collection = await getCollection(collectionName);
  } catch (error) {
    if (isCollectionMetadataTypeError(error)) {
      return [];
    }
    throw error;
  }

  const queryPayload = {
    queryEmbeddings: [embedding],
    nResults: limit,
    include: ["documents", "metadatas", "distances"]
  };

  if (where && Object.keys(where).length > 0) {
    queryPayload.where = where;
  }

  let result;
  try {
    result = await collection.query(queryPayload);
  } catch (error) {
    if (isCollectionMetadataTypeError(error)) {
      return [];
    }
    throw error;
  }

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
