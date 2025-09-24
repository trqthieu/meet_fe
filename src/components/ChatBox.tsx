import React, { useState, memo } from 'react';

type ChatProps = {
  userId: string;
  messages: { from: string; text: string }[];
  onSend: (msg: string) => void;
};

const ChatBox = memo(({ userId, messages, onSend }: ChatProps) => {
  const [newMessage, setNewMessage] = useState('');

  const sendMessage = () => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setNewMessage('');
  };

  return (
    <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: 4, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          padding: 8,
          overflowY: 'auto',
          maxHeight: 400,
        }}
      >
        {messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 6 }}>
            <b>{m.from === userId ? 'You' : m.from}:</b> {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: 8, borderTop: '1px solid #ccc' }}>
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{ flex: 1, marginRight: 8 }}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
});

export default ChatBox;
