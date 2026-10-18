import React from 'react';
import { createRoot } from 'react-dom/client';
import { AiCreationWorkspace } from '../../src/CreationWorkspace.jsx';
import { FeedbackProvider } from '../../src/FeedbackCenter.jsx';
import { listConversations, getConversationArtifact } from '../../src/conversationStore.js';
import '../../src/styles.css';
window.__runs = {};
window.__stored = () => listConversations('concurrency-fixture');
window.__artifact = getConversationArtifact;
const onCreate = (request, signal, delta, progress) => new Promise((resolve, reject) => {
  window.__runs[request.prompt] = { request, delta, progress, resolve, reject };
  signal.addEventListener('abort', () => reject(new DOMException('暂停', 'AbortError')), { once: true });
});
createRoot(document.getElementById('root')).render(<FeedbackProvider><AiCreationWorkspace account={{ id: 'concurrency-fixture' }} creation={{ enabled: true, models: [{ id: 'test-chat', name: '测试模型', capabilities: ['chat'] }], quota: {} }} onCreate={onCreate}/></FeedbackProvider>);
