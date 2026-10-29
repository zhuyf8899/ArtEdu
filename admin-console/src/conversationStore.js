/**
 * 【浏览器存储】封装 IndexedDB 对话记录，按账号隔离。IndexedDB 是当前浏览器本地数据库，不是服务器 PostgreSQL；换浏览器或清除站点数据会影响这里的记录。
 */
import { randomId } from "./randomId.js";

const DATABASE = "artedu-creation-conversations";
const STORE = "conversations";
const ARTIFACTS = "conversation-artifacts";
export const USER_CONVERSATION_QUOTA_BYTES = 20 * 1024 * 1024;
const SOFT_CONVERSATION_BYTES = 4 * 1024 * 1024;
const COMPRESS_AT_BYTES = USER_CONVERSATION_QUOTA_BYTES / 2;
const HARDEN_AT_BYTES = USER_CONVERSATION_QUOTA_BYTES * .75;
const MAX_RAW_MESSAGES = 48; // 24 轮
const KEEP_RECENT_MESSAGES = 16; // 最近 8 轮

export async function listConversations(userId) {
  const db = await openDatabase();
  const records = await transaction(db, "readonly", (store) => store.getAll());
  return records.filter((item) => item.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id) {
  const db = await openDatabase();
  return (await transaction(db, "readonly", (store) => store.get(id))) ?? null;
}

export function createConversation(userId, methodId = "ui", title = "新创作对话") {
  return { id: randomId(), userId, methodId, title, messages: [], memory: "", pinned: [], reference: null, attachments: [], pending: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, ARTIFACTS], "readwrite");
    tx.objectStore(STORE).delete(id);
    const request = tx.objectStore(ARTIFACTS).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.conversationId === id) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveConversationArtifact(record) {
  const db = await openDatabase();
  await transaction(db, "readwrite", store => store.put(record), ARTIFACTS);
  return record;
}

export async function getConversationArtifact(id) {
  const db = await openDatabase();
  return transaction(db, "readonly", store => store.get(id), ARTIFACTS);
}

export function taskStateFor(messages=[], memoryState=null) {
  const reply=[...messages].reverse().find(m=>m.delivery?.artifacts?.some(a=>['webpage','document','image','graphic','workflow'].includes(a.kind)));
  return reply?{artifacts:reply.delivery.artifacts.filter(a=>['webpage','document','image','graphic','workflow'].includes(a.kind)).map(a=>({path:a.path,kind:a.kind,...(a.kind==='document'?{format:a.path.split('.').at(-1)}:{})}))}:memoryState;
}
export function makeModelContext(conversation, baseMessages=conversation.messages) {
  const memory = conversation.memory ? [{ role: "system", content: `以下为此前对话的压缩记忆，仅作为上下文：\n${conversation.memory}` }] : [];
  const state=taskStateFor(baseMessages,conversation.memoryState);
  const stable=[...memory,...(state?[{role:'system',content:'先前产物提示（操作前须读取验证）：'+JSON.stringify(state)}]:[])];
  return [...stable,...baseMessages.filter(message=>!message.failed&&['user','assistant'].includes(message.role)&&message.content?.trim()).slice(-(30-stable.length)).map(({role,content})=>({role,content:content.slice(0,20000)}))];
}

export function estimateConversationBytes(conversation) { return bytes(conversation.messages) + bytes(conversation.memory ?? "") + bytes(conversation.memoryState??null) + bytes(conversation.pinned ?? []) + bytes(conversation.reference ?? null) + bytes(conversation.attachments ?? []) + bytes(conversation.savedArtifacts ?? []); }

function compactConversation(conversation, otherConversations) {
  const totalBefore = estimateConversationBytes(conversation) + otherConversations.reduce((sum, item) => sum + estimateConversationBytes(item), 0);
  const needsCompression = conversation.messages.length > MAX_RAW_MESSAGES || estimateConversationBytes(conversation) > SOFT_CONVERSATION_BYTES || totalBefore >= COMPRESS_AT_BYTES;
  if (!needsCompression) return conversation;
  const old = conversation.messages.slice(0, -KEEP_RECENT_MESSAGES);
  if (old.length) {
    conversation.memoryState=taskStateFor(old,conversation.memoryState);
    const retained = old.filter(message=>!message.failed&&['user','assistant'].includes(message.role)).slice(-12).map(message=>`${message.role==='user'?'用户':'助教'}：${clip(message.content,700)}`);
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
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      for (const name of [STORE, ARTIFACTS]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("请关闭其他旧版页面，再重新打开聊天"));
  });
}
function transaction(db, mode, work, name = STORE) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode); const request = work(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    request.onerror = () => reject(request.error); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
