import { useState } from 'react';
import { answerASBIQuestion, type ASBIContext, type ASBIReply } from '../asbi/core';

type Message = { role: 'user' | 'asbi'; text: string; details?: ASBIReply };

export default function ASBIPanel({ context, onClose }: { context: ASBIContext; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'asbi', text: 'ASBI Awake iniciado. Posso consultar os atuadores cadastrados no projeto atual. Ainda não realizo comandos físicos.' },
  ]);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    const answer = answerASBIQuestion(question, context);
    setMessages(old => [...old, { role: 'user', text: question }, { role: 'asbi', text: answer.message, details: answer }]);
    setInput('');
  }
  return (
    <aside aria-label="Assistente ASBI" style={{ position: 'absolute', zIndex: 50, right: 16, top: 76, bottom: 20, width: 'min(380px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', background: '#101b16', color: '#e5f5eb', border: '1px solid #315841', borderRadius: 14, boxShadow: '0 12px 40px #0009' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid #315841' }}>
        <div><strong>ASBI · Awake</strong><div style={{ fontSize: 11, color: '#a2b8a9' }}>Assistente local · somente leitura</div></div>
        <button type="button" onClick={onClose} aria-label="Fechar ASBI">×</button>
      </header>
      <div role="log" aria-live="polite" style={{ overflowY: 'auto', flex: 1, padding: 14, display: 'grid', alignContent: 'start', gap: 12 }}>
        {messages.map((message, index) => <div key={index} style={{ background: message.role === 'user' ? '#274b36' : '#1c3025', padding: 12, borderRadius: 10, overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 11, color: '#a7cdb3', marginBottom: 5 }}>{message.role === 'user' ? 'Você' : 'ASBI'}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{message.text}</div>
          {message.details?.evidence.length ? <ul style={{ paddingLeft: 18, fontSize: 12 }}>{message.details.evidence.map((item, i) => <li key={i}>{item}</li>)}</ul> : null}
          {message.details?.suggestions.map((item, i) => <p key={i} style={{ fontSize: 12, color: '#b7d6c0' }}>Sugestão: {item}</p>)}
        </div>)}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', padding: 12, gap: 8, borderTop: '1px solid #315841' }}>
        <input aria-label="Pergunta ao ASBI" value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte sobre o robô..." style={{ minWidth: 0, flex: 1, padding: 10, background: '#1b2b22', color: 'white', border: '1px solid #45614d', borderRadius: 8 }} />
        <button type="submit" disabled={!input.trim()}>Enviar</button>
      </form>
    </aside>
  );
}
