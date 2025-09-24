import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ICE_SERVERS } from '../utils/webrtc';
import ChatBox from '../components/ChatBox';

type RemotePeer = {
  socketId: string;
  userId?: string | null;
  pc: RTCPeerConnection;
  stream?: MediaStream;
};

const SIGNAL_SERVER = 'http://localhost:3001';

export default function Room({
  roomId,
  userId,
  onLeave,
}: {
  roomId: string;
  userId: string;
  onLeave: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RemotePeer>>({});
  const [, setRenderTick] = useState(0);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // 🔹 Chat state
  const [messages, setMessages] = useState<{ from: string; text: string }[]>(
    []
  );

  useEffect(() => {
    const s = io(SIGNAL_SERVER);
    setSocket(s);

    let mounted = true;

    const start = async () => {
      console.log('Starting connection to signaling server...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      s.emit('join-room', { roomId, userId });

      // 🔹 Chat listener
      s.on('chat-message', (msg: { from: string; text: string }) => {
        setMessages(prev => [...prev, msg]);
      });

      s.on(
        'existing-peer',
        async (payload: { socketId: string; userId?: string | null }) => {
          const { socketId, userId: theirUserId } = payload;
          const pc = createPeerConnection(socketId, s);
          localStreamRef.current
            ?.getTracks()
            .forEach(t => pc.addTrack(t, localStreamRef.current!));
          peersRef.current[socketId] = { socketId, userId: theirUserId, pc };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          s.emit('signal', {
            to: socketId,
            type: 'offer',
            data: offer,
            fromUserId: userId,
          });
        }
      );

      s.on(
        'new-peer',
        async (payload: { socketId: string; userId?: string | null }) => {
          const { socketId, userId: theirUserId } = payload;
          const pc = createPeerConnection(socketId, s);
          localStreamRef.current
            ?.getTracks()
            .forEach(t => pc.addTrack(t, localStreamRef.current!));
          peersRef.current[socketId] = { socketId, userId: theirUserId, pc };
          setRenderTick(t => t + 1);
        }
      );

      s.on(
        'signal',
        async (payload: {
          from: string;
          type: string;
          data: any;
          fromUserId?: string;
        }) => {
          const { from, type, data, fromUserId } = payload;
          let peer = peersRef.current[from];
          if (!peer) {
            const pc = createPeerConnection(from, s);
            localStreamRef.current
              ?.getTracks()
              .forEach(t => pc.addTrack(t, localStreamRef.current!));
            peersRef.current[from] = { socketId: from, userId: fromUserId, pc };
            peer = peersRef.current[from];
          }
          const pc = peer.pc;

          if (type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            s.emit('signal', {
              to: from,
              type: 'answer',
              data: answer,
              fromUserId: userId,
            });
          } else if (type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
          } else if (type === 'candidate') {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data));
            } catch (err) {
              console.warn('Failed to add ICE Candidate', err);
            }
          }
        }
      );

      s.on('peer-left', (payload: { socketId: string }) => {
        cleanupPeer(payload.socketId);
      });
    };

    start();

    function createPeerConnection(socketId: string, socket: Socket) {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = event => {
        if (event.candidate) {
          socket.emit('signal', {
            to: socketId,
            type: 'candidate',
            data: event.candidate,
            fromUserId: userId,
          });
        }
      };

      pc.ontrack = ev => {
        const stream = ev.streams[0];
        if (peersRef.current[socketId]) {
          peersRef.current[socketId].stream = stream;
        } else {
          peersRef.current[socketId] = { socketId, pc, stream };
        }
        setRenderTick(t => t + 1);
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'closed'
        ) {
          cleanupPeer(socketId);
        }
      };

      return pc;
    }

    function cleanupPeer(socketId: string) {
      const peer = peersRef.current[socketId];
      if (peer) {
        try {
          peer.pc.close();
        } catch (e) {}
        delete peersRef.current[socketId];
        setRenderTick(t => t + 1);
      }
    }

    return () => {
      cleanupAll();
      s.disconnect();
    };
  }, [roomId, userId]);

  function cleanupAll() {
    if (socket) socket.emit('leave-room', { roomId });
    Object.values(peersRef.current).forEach(p => p.pc.close());
    peersRef.current = {};
    localStreamRef.current?.getTracks().forEach(t => t.stop());
  }

  // 🔹 Toggle mic
  const toggleMic = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  };

  // 🔹 Toggle camera
  const toggleCam = () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOn(videoTrack.enabled);
    }
  };

  // 🔹 Leave room
  const leaveRoom = () => {
    cleanupAll();
    if (socket) socket.disconnect();
    onLeave();
  };

  const remoteVideos = Object.values(peersRef.current).map(p => (
    <div
      key={p.socketId}
      style={{ width: 240, height: 180, border: '1px solid #ccc', margin: 6 }}
    >
      <video
        autoPlay
        playsInline
        ref={el => {
          if (el && p.stream) el.srcObject = p.stream;
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div style={{ fontSize: 12 }}>{p.userId || p.socketId}</div>
    </div>
  ));

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Video section */}
      <div style={{ flex: 2 }}>
        <h3>Room: {roomId}</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ width: 320, height: 240 }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ fontSize: 12 }}>{userId} (you)</div>
          </div>
          {remoteVideos}
        </div>

        {/* Controls */}
        <div style={{ marginTop: 20 }}>
          <button onClick={toggleMic}>
            {micOn ? 'Mute Mic' : 'Unmute Mic'}
          </button>
          <button onClick={toggleCam} style={{ marginLeft: 10 }}>
            {camOn ? 'Turn Off Camera' : 'Turn On Camera'}
          </button>
          <button onClick={leaveRoom} style={{ marginLeft: 10, color: 'red' }}>
            Leave Room
          </button>
        </div>
      </div>

      {/* Chat section */}
      {/* <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: 4, display: 'flex', flexDirection: 'column' }}>
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
      </div> */}

      <ChatBox
        userId={userId}
        messages={messages}
        onSend={msg => {
          if (socket) {
            socket.emit('chat-message', {
              to: roomId,
              from: userId,
              text: msg,
            });
          }
          // local echo
          // setMessages(prev => [...prev, { from: userId, text: msg }]);
        }}
      />
    </div>
  );
}
