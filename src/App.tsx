import React, { useState } from 'react';
import Room from './pages/Room';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('room-1');
  const [userId, setUserId] = useState(
    'user-' + Math.floor(Math.random() * 1000)
  );

  return (
    <div style={{ padding: 20 }}>
      {!joined ? (
        <div>
          <h2>Join Room</h2>
          <div>
            <label>Room ID</label>
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          </div>
          <div>
            <label>User ID</label>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <button onClick={() => setJoined(true)}>Join</button>
        </div>
      ) : (
        <Room
          roomId={roomId}
          userId={userId}
          onLeave={() => setJoined(false)}
        />
      )}
    </div>
  );
}
