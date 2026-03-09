import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Send, Bot, User, Cpu, Image as ImageIcon, X, Plus, MessageSquare, Menu, Trash2 } from 'lucide-react';

const socket = io("https://7rpxvs58-3001.usw3.devtunnels.ms", {
  transports: ['websocket', 'polling'],
  autoConnect: true
});

function App() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('lastSessionId') || crypto.randomUUID());
  const [chatList, setChatList] = useState(() => {
    const saved = localStorage.getItem('chatList');
    return saved ? JSON.parse(saved) : [];
  });
  const [userId] = useState("usuario-local");
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [previewImage, setPreviewImage] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // --- PERSISTENCIA ---
  useEffect(() => {
    localStorage.setItem('chatList', JSON.stringify(chatList));
    localStorage.setItem('lastSessionId', sessionId);
  }, [chatList, sessionId]);

  // --- SOCKETS ---
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('contentChunk', (data) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          const newArr = [...prev];
          newArr[newArr.length - 1] = { ...last, content: last.content + data.text };
          return newArr;
        }
        return [...prev, { role: 'assistant', content: data.text }];
      });
    });
    socket.on('status', (data) => setStatus(data.state === 'executing_tool' ? `🔨 ${data.tool}` : data.state));
    socket.on('responseFinished', () => setStatus('idle'));

    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('contentChunk'); socket.off('status'); socket.off('responseFinished');
    };
  }, []);

  // --- CARGAR HISTORIAL ---
  useEffect(() => {
    const fetchHistory = async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`https://7rpxvs58-3000.usw3.devtunnels.ms/chat/history/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.map(m => ({ role: m.role, content: m.content })));
        }
      } catch (err) { console.error(err); }
    };
    fetchHistory();
  }, [sessionId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // --- ACCIONES ---
  const loadChat = (id) => {
    setSessionId(id);
    setMessages([]);
  };

  const startNewChat = () => {
    const newId = crypto.randomUUID();
    const newChat = { id: newId, title: `Chat ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`, date: Date.now() };
    setChatList(prev => [newChat, ...prev]);
    setSessionId(newId);
    setMessages([]);
  };

  const deleteChat = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("¿Borrar permanentemente?")) return;
    try {
      await fetch(`https://7rpxvs58-3000.usw3.devtunnels.ms/chat/session/${userId}/${id}`, { method: 'DELETE' });
      setChatList(prev => {
        const filtered = prev.filter(c => c.id !== id);
        if (id === sessionId) {
          if (filtered.length > 0) setSessionId(filtered[0].id);
          else startNewChat();
        }
        return filtered;
      });
    } catch (err) { console.error(err); }
  };

  const sendMessage = () => {
    if (!input.trim() && !base64Image) return;
    if (chatList.length === 0) startNewChat();
    setMessages(prev => [...prev, { role: 'user', content: input, image: previewImage }]);
    socket.emit('sendMessage', { prompt: input, userId, sessionId, image: base64Image });
    setInput(''); setPreviewImage(null); setBase64Image(null); setStatus('thinking');
  };

  return (
    <div style={styles.mainWrapper}>
      <aside style={{...styles.sidebar, width: isSidebarOpen ? '260px' : '0'}}>
        <div style={{padding: '20px', minWidth: '260px', boxSizing: 'border-box'}}>
          <button onClick={startNewChat} style={styles.newChatBtn}><Plus size={18}/> Nuevo Chat</button>
          <div style={styles.historyList}>
            {chatList.map(chat => (
              <div key={chat.id} onClick={() => loadChat(chat.id)} 
                style={{...styles.chatItem, backgroundColor: sessionId === chat.id ? '#2c2c2c' : 'transparent'}}>
                <MessageSquare size={16} color={sessionId === chat.id ? '#4CAF50' : '#666'} />
                <span style={styles.chatItemText}>{chat.title}</span>
                <button onClick={(e) => deleteChat(e, chat.id)} style={styles.trashBtn}><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={styles.chatArea}>
        <header style={styles.header}>
          <div style={{display: 'flex', alignItems: 'center'}}>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={styles.iconBtn}><Menu size={24} /></button>
            <div style={{...styles.statusDot, backgroundColor: isConnected ? '#4CAF50' : '#ff4b4b'}} />
            <h2 style={{fontSize: '0.9rem', color: '#fff'}}>Brain Kernel RTX</h2>
          </div>
          <div style={styles.badge}>{status === 'idle' ? 'Listo' : status}</div>
        </header>

        <div style={styles.messagesBox}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === 'user' ? styles.userRow : styles.aiRow}>
              <div style={m.role === 'user' ? styles.userBubble : styles.aiBubble}>
                <p style={{margin: 0, fontSize: '0.95rem', lineHeight: '1.4'}}>{m.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={styles.inputSection}>
          <div style={styles.inputContainer}>
            <button onClick={() => fileInputRef.current.click()} style={styles.iconBtn}><ImageIcon size={20} /></button>
            <input type="file" ref={fileInputRef} onChange={(e) => {
              const file = e.target.files[0];
              if(file) {
                setPreviewImage(URL.createObjectURL(file));
                const r = new FileReader(); r.onloadend = () => setBase64Image(r.result.split(',')[1]); r.readAsDataURL(file);
              }
            }} style={{display:'none'}} accept="image/*"/>
            <input style={styles.input} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Escribe un mensaje..."/>
            <button onClick={sendMessage} style={styles.sendBtn} disabled={status !== 'idle' || !isConnected}><Send size={20}/></button>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  mainWrapper: { display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#050505', color: '#d1d1d1', fontFamily: 'Inter, sans-serif', overflow: 'hidden' },
  sidebar: { backgroundColor: '#000', borderRight: '1px solid #222', transition: '0.3s', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  newChatBtn: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #333', backgroundColor: '#111', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '20px' },
  historyList: { flex: 1, overflowY: 'auto' },
  chatItem: { padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '4px', justifyContent: 'space-between', boxSizing: 'border-box' },
  chatItemText: { fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trashBtn: { background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  header: { padding: '12px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#000' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', marginLeft: '15px' },
  badge: { fontSize: '0.6rem', color: '#4CAF50', padding: '3px 8px', borderRadius: '4px', border: '1px solid #4CAF50', textTransform: 'uppercase' },
  messagesBox: { flex: 1, overflowY: 'auto', padding: '20px 15%', display: 'flex', flexDirection: 'column', gap: '15px' },
  userRow: { alignSelf: 'flex-end', maxWidth: '85%' },
  aiRow: { alignSelf: 'flex-start', maxWidth: '85%' },
  userBubble: { backgroundColor: '#1a1a1a', padding: '12px 16px', borderRadius: '15px 15px 2px 15px', border: '1px solid #333' },
  aiBubble: { backgroundColor: '#0a0a0a', padding: '12px 16px', borderRadius: '15px 15px 15px 2px', border: '1px solid #222' },
  inputSection: { padding: '20px 15%' },
  inputContainer: { display: 'flex', gap: '12px', backgroundColor: '#111', padding: '10px', borderRadius: '12px', border: '1px solid #333', alignItems: 'center' },
  input: { flex: 1, background: 'none', border: 'none', color: '#fff', outline: 'none', fontSize: '0.95rem' },
  sendBtn: { background: 'none', border: 'none', color: '#4CAF50', cursor: 'pointer' },
  iconBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer' }
};

export default App;
