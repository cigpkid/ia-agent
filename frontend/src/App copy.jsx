import { useState } from 'react';
import { Send, Bot, User, Cpu } from 'lucide-react'; // Iconos bonitos

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, thinking, calling_tool

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStatus('thinking');

    try {
      // Llamamos al GATEWAY de NestJS, no a Ollama directamente
      const response = await fetch('http://localhost:3000/chat/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await response.json();

      // Si el Orquestador usó una herramienta MCP, lo indicamos
      if (data.toolUsed) {
        setMessages(prev => [...prev, { 
          role: 'system', 
          content: `🛠️ Herramienta usada: ${data.toolUsed}`,
          isTool: true 
        }]);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      console.error("Error en el flujo NATS/MCP:", err);
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <Cpu size={24} color="#4CAF50" />
        <h2 style={{marginLeft: '10px'}}>IA Local Orchestrator (NATS + MCP)</h2>
      </header>

      <div style={styles.chatBox}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? styles.userRow : styles.aiRow}>
            <div style={m.isTool ? styles.toolBubble : (m.role === 'user' ? styles.userBubble : styles.aiBubble)}>
              {m.role === 'assistant' && <Bot size={16} style={{marginRight: '8px'}} />}
              {m.role === 'user' && <User size={16} style={{marginRight: '8px'}} />}
              {m.content}
            </div>
          </div>
        ))}
        {status === 'thinking' && <div style={styles.loader}>La RTX 5060 Ti está pensando...</div>}
      </div>

      <div style={styles.inputArea}>
        <input 
          style={styles.input}
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Envía un comando al sistema..."
        />
        <button onClick={sendMessage} style={styles.button} disabled={status !== 'idle'}>
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', color: '#fff', fontFamily: 'Inter, sans-serif' },
  header: { padding: '20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center' },
  chatBox: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' },
  userRow: { alignSelf: 'flex-end', maxWidth: '80%' },
  aiRow: { alignSelf: 'flex-start', maxWidth: '80%' },
  userBubble: { backgroundColor: '#2979ff', padding: '12px 16px', borderRadius: '15px 15px 0 15px', display: 'flex', alignItems: 'center' },
  aiBubble: { backgroundColor: '#333', padding: '12px 16px', borderRadius: '15px 15px 15px 0', display: 'flex', alignItems: 'center', border: '1px solid #444' },
  toolBubble: { backgroundColor: '#4a148c', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85em', color: '#e1bee7', fontStyle: 'italic' },
  inputArea: { padding: '20px', display: 'flex', gap: '10px', backgroundColor: '#222' },
  input: { flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#333', color: '#fff', outline: 'none' },
  button: { padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#4CAF50', color: '#fff', cursor: 'pointer' },
  loader: { fontSize: '0.8em', color: '#888', fontStyle: 'italic', marginTop: '10px' }
};

export default App;
