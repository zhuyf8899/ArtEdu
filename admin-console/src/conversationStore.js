import { randomId } from "./randomId.js";

const DATABASE = "artedu-creation-conversations";
const STORE = "conversations";
export const USER_CONVERSATION_QUOTA_BYTES = 20 * 1024 * 1024;
const SOFT_CONVERSATION_BYTES = 4 * 1024 * 1024;
const COMPRESS_AT_BYTES = USER_CONVERSATION_QUOTA_BYTES / 2;
const HARDEN_AT_BYTES = USER_CONVERSATION_QUOTA_BYTES * .75;
const MAX_RAW_MESSAGES = 48; // 24 轮
const KEEP_RECENT_MESSAGES = 16; // 最近 8 轮
// 空字符串代表工作区根目录：默认工作区在服务端始终存在，不需要额外创建。
export const DEFAULT_WORKSPACE = "";

export async function listConversations(userId) {
  const db = await openDatabase();
  const records = await transaction(db, "readonly", (store) => store.getAll());
  // 早于工作区分组的记录没有 workspace 字段，读出来一律算默认工作区，不丢历史对话。
  return records.filter((item) => item.userId === userId)
    .map((item) => ({ ...item, workspace: conversationWorkspace(item) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id) {
  const db = await openDatabase();
  const record = (await transaction(db, "readonly", (store) => store.get(id))) ?? null;
  return record ? { ...record, workspace: conversationWorkspace(record) } : null;
}

export function createConversation(userId, methodId = "ui", title = "新创作对话", workspace = DEFAULT_WORKSPACE) {
  return { id: randomId(), userId, methodId, title, workspace: conversationWorkspace({ workspace }), messages: [], memory: "", pinned: [], reference: null, attachments: [], pending: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

/** 对话所属工作区；缺失或空值一律归入默认工作区，保证分组名永远可用。 */
export function conversationWorkspace(conversation) {
  const workspace = conversation?.workspace;
  return typeof workspace === "string" && workspace.trim() ? workspace.trim() : DEFAULT_WORKSPACE;
}

export function workspaceLabel(workspace) {
  return conversationWorkspace({ workspace }) || "默认工作区";
}

/** 只保留指定工作区的对话，供侧栏按工作区分组渲染。 */
export function conversationsInWorkspace(conversations, workspace) {
  const target = conversationWorkspace({ workspace });
  return conversations.filter((item) => conversationWorkspace(item) === target);
}

export async function saveConversation(conversation) {
  const all = await listConversations(conversation.userId);
  const prepared = compactConversation({ ...conversation, updatedAt: new Date().toISOString() }, all.filter((item) => item.id !== conversation.id));
  const db = await openDatabase();
  await transaction(db, "readwrite", (store) => store.put(prepared));
  return prepared;
}

export async function deleteConversation(id) {
  const db = await openDatabase();
  await transaction(db, "readwrite", (store) => store.delete(id));
}

export function makeModelContext(conversation) {
  const memory = conversation.memory ? [{ role: "system", content: `以下为此前对话的压缩记忆，仅作为上下文：\n${conversation.memory}` }] : [];
  return [...memory, ...conversation.messages.filter((message) => !message.failed && message.content?.trim()).map(({ role, content }) => ({ role, content: content.slice(0, 20000) }))].slice(-30);
}

export function estimateConversationBytes(conversation) { return bytes(conversation.messages) + bytes(conversation.memory ?? "") + bytes(conversation.pinned ?? []) + bytes(conversation.reference ?? null) + bytes(conversation.attachments ?? []); }

function compactConversation(conversation, otherConversations) {
  const totalBefore = estimateConversationBytes(conversation) + otherConversations.reduce((sum, item) => sum + estimateConversationBytes(item), 0);
  const needsCompression = conversation.messages.length > MAX_RAW_MESSAGES || estimateConversationBytes(conversation) > SOFT_CONVERSATION_BYTES || totalBefore >= COMPRESS_AT_BYTES;
  if (!needsCompression) return conversation;
  const old = conversation.messages.slice(0, -KEEP_RECENT_MESSAGES);
  if (old.length) {
    const retained = old.filter((message) => message.role === "user").slice(-12).map((message) => `用户：${clip(message.content, 700)}`);
    const prior = conversation.memory ? `${conversation.memory}\n` : "";
    conversation.memory = clip(`${prior}已压缩的历史要点：\n${retained.join("\n") || "此前已讨论创作方案。"}`, 10000);
    conversation.messages = conversation.messages.slice(-KEEP_RECENT_MESSAGES);
  }
  const totalAfter = estimateConversationBytes(conversation) + otherConversations.reduce((sum, item) => sum + estimateConversationBytes(item), 0);
  if (totalAfter > HARDEN_AT_BYTES) {
    conversation.memory = clip(conversation.memory, 3500);
    conversation.messages = conversation.messages.slice(-8).map((message) => ({ ...message, content: clip(message.content, 3000) }));
  }
  return conversation;
}

function clip(value, max) { return String(value).replace(/\s+/g, " ").trim().slice(0, max); }
function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); const request = work(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.onerror = () => reject(tx.error);
  });
}
