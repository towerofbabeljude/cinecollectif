import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Flame, Heart, Sparkles, AlertCircle } from 'lucide-react';
import { socket, clientId } from '../lib/socket';

const EMOJI_LIST = ['🍿', '🔥', '❤️', '😂', '😮', '👏', '🚀', '😱'];

export default function Chat({ messages, members, onTriggerReaction }) {
  const [inputText, setInputText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const messagesEndRef = useRef(null);

  // Auto scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    socket.emit('chat:send', { text: inputText.trim() }, (response) => {
      if (response && response.error) {
        setErrorMsg(response.error);
        setTimeout(() => setErrorMsg(''), 4000);
      }
    });

    setInputText('');
  };

  const handleSendReaction = (emoji) => {
    socket.emit('reaction:send', { emoji }, (response) => {
      if (response && response.error) {
        setErrorMsg(response.error);
        setTimeout(() => setErrorMsg(''), 4000);
      }
    });
    // Trigger local reaction visual right away
    if (onTriggerReaction) {
      onTriggerReaction(emoji);
    }
  };

  return (
    <div
      id="syncwatch-chat-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden'
      }}
    >
      {/* Chat Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#ef4444" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>Live Chat & Reactions</h3>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {messages.length} messages
        </span>
      </div>

      {/* Floating Reactions Bar */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          gap: '8px',
          justifyContent: 'space-around',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        {EMOJI_LIST.map((em) => (
          <button
            key={em}
            id={`reaction-btn-${em}`}
            onClick={() => handleSendReaction(em)}
            style={{
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '1.25rem',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, background 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.25)';
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
            }}
          >
            {em}
          </button>
        ))}
      </div>

      {/* Error alert if rate limited */}
      {errorMsg && (
        <div
          style={{
            margin: '8px 12px 0',
            padding: '8px 12px',
            backgroundColor: 'rgba(220, 38, 38, 0.2)',
            border: '1px solid var(--accent-red)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <AlertCircle size={14} />
          {errorMsg}
        </div>
      )}

      {/* Message List */}
      <div
        id="chat-messages-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            <p style={{ color: '#fff' }}>Welcome to the watch party!</p>
            <p style={{ marginTop: 4 }}>Say hello or drop a reaction ✨</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.clientId === clientId;
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    marginBottom: 2
                  }}
                >
                  <span style={{ fontWeight: 600, color: isMe ? '#fca5a5' : '#ffffff' }}>
                    {isMe ? 'You' : msg.name}
                  </span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '8px 14px',
                    borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    backgroundColor: isMe ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                    border: isMe ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: '8px',
          backgroundColor: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <input
          id="chat-input-field"
          type="text"
          placeholder="Send a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={500}
          className="input-field"
          style={{ padding: '8px 14px', fontSize: '14px' }}
        />
        <button
          id="chat-send-btn"
          type="submit"
          className="btn-primary"
          style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)' }}
          disabled={!inputText.trim()}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
