// Isolated actual login UI: no sign-out, account change or login request in visual QA.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LocalLogin} from '../../src/Portal.jsx';
import '../../src/styles.css';
import '../../src/morph/platform-unified.css';
const root=createRoot(document.getElementById('root'));
root.render(<LocalLogin onLogin={async()=>{throw new Error('此页仅用于 UI 检查，请返回平台登录。');}}/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
