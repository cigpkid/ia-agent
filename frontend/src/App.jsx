import { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  Send,
  Image as ImageIcon,
  Plus,
  MessageSquare,
  Menu,
  Trash2,
} from 'lucide-react';

const API_URL = 'https://7rpxvs58-3000.usw3.devtunnels.ms';
const SOCKET_URL = 'https://7rpxvs58-3001.usw3.devtunnels.ms';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

function normalizeSeverity(severity) {
  return (severity || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getSeverityColor(severity) {
  switch (normalizeSeverity(severity)) {
    case 'CRITICO':
      return '#b91c1c';
    case 'WARNING':
      return '#b45309';
    case 'OK':
      return '#15803d';
    case 'SUSPENDIDA':
      return '#475569';
    case 'SIN_DATOS':
      return '#334155';
    default:
      return '#1f2937';
  }
}

function NocCards({ ui, fallbackText, streaming }) {
  if (streaming || !ui || !ui.units?.length) {
    return <div style={styles.plainText}>{fallbackText}</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {ui.summary && (
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '12px',
            padding: '12px',
            color: '#e5e7eb',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>Resumen NOC</div>
          <div style={styles.cardRow}>
            <strong>Total encontradas:</strong> {ui.summary.total_encontradas}
          </div>
          <div style={styles.cardRow}>
            <strong>OK:</strong> {ui.summary.ok}
          </div>
          <div style={styles.cardRow}>
            <strong>WARNING:</strong> {ui.summary.warning}
          </div>
          <div style={styles.cardRow}>
            <strong>CRITICO:</strong> {ui.summary.critico}
          </div>
          <div style={styles.cardRow}>
            <strong>SUSPENDIDA:</strong> {ui.summary.suspendida}
          </div>
          <div style={styles.cardRow}>
            <strong>SIN_DATOS:</strong> {ui.summary.sin_datos}
          </div>
        </div>
      )}

      {ui.units.map((item, index) => (
        <div
          key={`${item.unidad_id ?? 'na'}_${index}`}
          style={{
            border: `1px solid ${getSeverityColor(item.severidad)}`,
            borderLeft: `8px solid ${getSeverityColor(item.severidad)}`,
            borderRadius: '12px',
            padding: '14px',
            backgroundColor: '#0f172a',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              marginBottom: '10px',
              color: '#fff',
            }}
          >
            {item.unidad_nombre || `Unidad ${item.unidad_id ?? 'sin nombre'}`}
          </div>

          <div style={styles.cardRow}>
            <strong>ID:</strong> {item.unidad_id ?? 'N/D'}
          </div>
          <div style={styles.cardRow}>
            <strong>IMEI:</strong> {item.imei ?? 'N/D'}
          </div>
          <div style={styles.cardRow}>
            <strong>Placa:</strong> {item.placa ?? 'N/D'}
          </div>
          <div style={styles.cardRow}>
            <strong>Última comunicación:</strong> {item.ultima_comunicacion ?? 'N/D'}
          </div>
          <div style={styles.cardRow}>
            <strong>Horas sin comunicación:</strong>{' '}
            {item.horas_sin_comunicacion ?? 'N/D'}
          </div>

          <div style={{ ...styles.cardRow, marginTop: '8px' }}>
            <strong>Severidad:</strong>{' '}
            <span
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: getSeverityColor(item.severidad),
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              {item.severidad || 'N/D'}
            </span>
          </div>

          <div style={{ marginTop: '12px' }}>
            <strong>Diagnóstico:</strong>
            <div style={styles.cardText}>
              {item.diagnostico || 'Sin diagnóstico'}
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <strong>Acción recomendada:</strong>
            <div style={styles.cardText}>
              {item.accion_recomendada || 'Sin acción recomendada'}
            </div>
          </div>
        </div>
      ))}

      {fallbackText ? (
        <details
          style={{
            backgroundColor: '#0b0b0b',
            border: '1px solid #222',
            borderRadius: '10px',
            padding: '10px',
          }}
        >
          <summary style={{ cursor: 'pointer', color: '#9ca3af' }}>
            Ver respuesta textual
          </summary>
          <div style={{ ...styles.plainText, marginTop: '8px' }}>{fallbackText}</div>
        </details>
      ) : null}
    </div>
  );
}

function App() {
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem('lastSessionId') || crypto.randomUUID(),
  );
  const [chatList, setChatList] = useState([]);
  const [userId] = useState('usuario-local');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [previewImage, setPreviewImage] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('lastSessionId', sessionId);
  }, [sessionId]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions/${userId}`);
      if (!res.ok) return;

      const data = await res.json();

      const mapped = data
        .map((item) => ({
          id: item.sessionId,
          title: item.title || 'Chat recuperado',
          date: new Date(item.lastCreatedAt).getTime(),
        }))
        .sort((a, b) => b.date - a.date);

      setChatList(mapped);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [userId]);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('contentChunk', (data) => {
      setMessages((prev) => {
        const newArr = [...prev];
        const lastIndex = newArr.length - 1;

        if (lastIndex >= 0 && newArr[lastIndex]?.role === 'assistant') {
          newArr[lastIndex] = {
            ...newArr[lastIndex],
            content: (newArr[lastIndex].content || '') + data.text,
            streaming: true,
          };
          return newArr;
        }

        return [
          ...prev,
          { role: 'assistant', content: data.text, streaming: true, ui: null },
        ];
      });
    });

    socket.on('status', (data) => {
      setStatus(data.state === 'executing_tool' ? `🔨 ${data.tool}` : data.state);
    });

    socket.on('responseFinished', (payload) => {
      setStatus('idle');

      setMessages((prev) => {
        const newArr = [...prev];
        const lastIndex = newArr.length - 1;

        if (lastIndex >= 0 && newArr[lastIndex]?.role === 'assistant') {
          newArr[lastIndex] = {
            ...newArr[lastIndex],
            content: payload?.response || newArr[lastIndex].content || '',
            ui: payload?.ui || null,
            streaming: false,
          };
        }

        return newArr;
      });

      fetchSessions();
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('contentChunk');
      socket.off('status');
      socket.off('responseFinished');
    };
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!sessionId) return;

      try {
        const res = await fetch(`${API_URL}/chat/history/${sessionId}`);
        if (res.ok) {
          const data = await res.json();

          setMessages(
            data.map((m) => {
              let parsedUi = null;

              try {
                parsedUi = m.uiPayload ? JSON.parse(m.uiPayload) : null;
              } catch {
                parsedUi = null;
              }

              return {
                role: m.role,
                content: m.content,
                streaming: false,
                ui: parsedUi,
              };
            }),
          );
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchHistory();
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChat = (id) => {
    setSessionId(id);
    setMessages([]);
  };

  const startNewChat = () => {
    const newId = crypto.randomUUID();

    setSessionId(newId);
    setMessages([]);
    setInput('');
    setPreviewImage(null);
    setBase64Image(null);
    setStatus('idle');

    setChatList((prev) => {
      const exists = prev.some((c) => c.id === newId);
      if (exists) return prev;

      return [
        {
          id: newId,
          title: 'Nuevo chat',
          date: Date.now(),
        },
        ...prev,
      ];
    });
  };

  const deleteChat = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('¿Borrar permanentemente?')) return;

    try {
      await fetch(`${API_URL}/chat/session/${userId}/${id}`, {
        method: 'DELETE',
      });

      const filtered = chatList.filter((c) => c.id !== id);
      setChatList(filtered);

      if (id === sessionId) {
        if (filtered.length > 0) {
          setSessionId(filtered[0].id);
        } else {
          startNewChat();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = () => {
    if (!input.trim() && !base64Image) return;

    const currentPrompt = input;

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: currentPrompt,
        image: previewImage,
        streaming: false,
      },
      {
        role: 'assistant',
        content: '',
        streaming: true,
        ui: null,
      },
    ]);

    socket.emit('sendMessage', {
      prompt: currentPrompt,
      userId,
      sessionId,
      image: base64Image,
    });

    setInput('');
    setPreviewImage(null);
    setBase64Image(null);
    setStatus('thinking');
  };

  return (
    <div style={styles.mainWrapper}>
      <aside
        style={{
          ...styles.sidebar,
          width: isSidebarOpen ? '260px' : '0',
        }}
      >
        <div
          style={{
            padding: '20px',
            minWidth: '260px',
            boxSizing: 'border-box',
          }}
        >
          <button onClick={startNewChat} style={styles.newChatBtn}>
            <Plus size={18} /> Nuevo Chat
          </button>

          <div style={styles.historyList}>
            {chatList.map((chat) => (
              <div
                key={chat.id}
                onClick={() => loadChat(chat.id)}
                style={{
                  ...styles.chatItem,
                  backgroundColor:
                    sessionId === chat.id ? '#2c2c2c' : 'transparent',
                }}
              >
                <MessageSquare
                  size={16}
                  color={sessionId === chat.id ? '#4CAF50' : '#666'}
                />
                <span style={styles.chatItemText}>{chat.title}</span>
                <button
                  onClick={(e) => deleteChat(e, chat.id)}
                  style={styles.trashBtn}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={styles.chatArea}>
        <header style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={styles.iconBtn}
            >
              <Menu size={24} />
            </button>
            <div
              style={{
                ...styles.statusDot,
                backgroundColor: isConnected ? '#4CAF50' : '#ff4b4b',
              }}
            />
            <h2 style={{ fontSize: '0.9rem', color: '#fff' }}>
              Brain Kernel RTX
            </h2>
          </div>
          <div style={styles.badge}>{status === 'idle' ? 'Listo' : status}</div>
        </header>

        <div style={styles.messagesBox}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={m.role === 'user' ? styles.userRow : styles.aiRow}
            >
              <div
                style={m.role === 'user' ? styles.userBubble : styles.aiBubble}
              >
                {m.role === 'assistant' ? (
                  <NocCards
                    ui={m.ui}
                    fallbackText={m.content}
                    streaming={m.streaming}
                  />
                ) : (
                  <div style={styles.plainText}>{m.content}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={styles.inputSection}>
          <div style={styles.inputContainer}>
            <button
              onClick={() => fileInputRef.current.click()}
              style={styles.iconBtn}
            >
              <ImageIcon size={20} />
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  setPreviewImage(URL.createObjectURL(file));
                  const r = new FileReader();
                  r.onloadend = () =>
                    setBase64Image(r.result.split(',')[1]);
                  r.readAsDataURL(file);
                }
              }}
              style={{ display: 'none' }}
              accept="image/*"
            />

            <input
              style={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Escribe un mensaje..."
            />

            <button
              onClick={sendMessage}
              style={styles.sendBtn}
              disabled={status !== 'idle' || !isConnected}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  mainWrapper: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#050505',
    color: '#d1d1d1',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  },
  sidebar: {
    backgroundColor: '#000',
    borderRight: '1px solid #222',
    transition: '0.3s',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  newChatBtn: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#111',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    marginBottom: '20px',
  },
  historyList: {
    flex: 1,
    overflowY: 'auto',
  },
  chatItem: {
    padding: '10px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    marginBottom: '4px',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
  },
  chatItemText: {
    fontSize: '0.85rem',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trashBtn: {
    background: 'none',
    border: 'none',
    color: '#444',
    cursor: 'pointer',
    padding: '5px',
    display: 'flex',
    alignItems: 'center',
  },
  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    padding: '12px 20px',
    borderBottom: '1px solid #222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginLeft: '15px',
  },
  badge: {
    fontSize: '0.6rem',
    color: '#4CAF50',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid #4CAF50',
    textTransform: 'uppercase',
  },
  messagesBox: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 15%',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  userRow: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  aiRow: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: '#1a1a1a',
    padding: '12px 16px',
    borderRadius: '15px 15px 2px 15px',
    border: '1px solid #333',
  },
  aiBubble: {
    backgroundColor: '#0a0a0a',
    padding: '12px 16px',
    borderRadius: '15px 15px 15px 2px',
    border: '1px solid #222',
    width: '100%',
  },
  inputSection: {
    padding: '20px 15%',
  },
  inputContainer: {
    display: 'flex',
    gap: '12px',
    backgroundColor: '#111',
    padding: '10px',
    borderRadius: '12px',
    border: '1px solid #333',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#fff',
    outline: 'none',
    fontSize: '0.95rem',
  },
  sendBtn: {
    background: 'none',
    border: 'none',
    color: '#4CAF50',
    cursor: 'pointer',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
  },
  cardRow: {
    fontSize: '0.92rem',
    lineHeight: '1.5',
    marginTop: '4px',
  },
  cardText: {
    marginTop: '4px',
    color: '#cbd5e1',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  plainText: {
    margin: 0,
    fontSize: '0.95rem',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
};

export default App;