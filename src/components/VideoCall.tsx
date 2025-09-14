import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import styled from 'styled-components';

const Layout = styled.div`
  display: flex;
  height: 100vh;
`;

const VideoSection = styled.div`
  flex: 3;
  display: flex;
  flex-direction: column;
`;

const VideoContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  padding: 20px;
  flex: 1;
  overflow-y: auto;
`;

const Video = styled.video`
  width: 100%;
  border-radius: 10px;
  background-color: #1e1e1e;
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  gap: 15px;
  padding: 15px;
  background-color: rgba(0, 0, 0, 0.7);
`;

const Button = styled.button`
  background-color: ${(props) => props.color || '#3c4043'};
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  color: white;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.8;
  }
`;

const ChatPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #444;
  background: #2b2b2b;
  color: white;
`;

const ChatMessages = styled.div`
  flex: 1;
  padding: 10px;
  overflow-y: auto;
`;

const ChatInputContainer = styled.div`
  display: flex;
  padding: 10px;
  background: #1e1e1e;
`;

const ChatInput = styled.input`
  flex: 1;
  padding: 8px;
  border-radius: 5px;
  border: none;
  margin-right: 8px;
`;

const ChatButton = styled.button`
  padding: 8px 12px;
  border-radius: 5px;
  border: none;
  background-color: #0b57d0;
  color: white;
  cursor: pointer;

  &:hover {
    background-color: #0d47a1;
  }
`;

interface VideoCallProps {
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, userId, onLeave }) => {
  const [peers, setPeers] = useState<any[]>([]);
  console.log('peers>>', peers);
  
  const [messages, setMessages] = useState<{ from: string; text: string }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const socketRef = useRef<any>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<any[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        streamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }

        socketRef.current.emit('join-room', { roomId, userId });

        socketRef.current.on('user-connected', (data: { userId: string }) => {
          const peer = createPeer(data.userId, socketRef.current.id, stream);
          peersRef.current.push({ peerID: data.userId, peer });
          setPeers(users => [...users, { userId: data.userId, peer }]);
        });

        socketRef.current.on('current-participants', (participants: string[]) => {
          const peers: any[] = [];
          participants.forEach(participantId => {
            const peer = createPeer(participantId, socketRef.current.id, stream);
            peersRef.current.push({ peerID: participantId, peer });
            peers.push({ userId: participantId, peer });
          });
          setPeers(peers);
        });

        socketRef.current.on('user-disconnected', (data: { userId: string }) => {
          const peerObj = peersRef.current.find(p => p.peerID === data.userId);
          if (peerObj) peerObj.peer.destroy();

          setPeers(peers => peers.filter(p => p.userId !== data.userId));
          peersRef.current = peersRef.current.filter(p => p.peerID !== data.userId);
        });

        socketRef.current.on('offer', handleOffer);
        socketRef.current.on('answer', handleAnswer);
        socketRef.current.on('ice-candidate', handleIceCandidate);

        // ✅ Chat listener
        socketRef.current.on('chat-message', (msg: { from: string; text: string }) => {
          console.log(msg);
          
          setMessages(prev => [...prev, msg]);
        });
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
      });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      socketRef.current.disconnect();
    };
  }, [roomId, userId]);

  const createPeer = (userToSignal: string, callerID: string, stream: MediaStream) => {
    const peer = new Peer({ initiator: true, trickle: false, stream });

    peer.on('signal', signal => {
      socketRef.current.emit('offer', {
        offer: signal,
        to: userToSignal,
        roomId,
      });
    });

    return peer;
  };

  const handleOffer = (data: { offer: any; from: string }) => {
    const peer = addPeer(data.offer, data.from, streamRef.current!);
    peersRef.current.push({ peerID: data.from, peer });
    setPeers(users => [...users, { userId: data.from, peer }]);
  };

  const addPeer = (incomingSignal: any, callerID: string, stream: MediaStream) => {
    const peer = new Peer({ initiator: false, trickle: false, stream });

    peer.on('signal', signal => {
      socketRef.current.emit('answer', {
        answer: signal,
        to: callerID,
      });
    });

    peer.signal(incomingSignal);
    return peer;
  };

  const handleAnswer = (data: { answer: any; from: string }) => {
    const item = peersRef.current.find(p => p.peerID === data.from);
    if (item) item.peer.signal(data.answer);
  };

  const handleIceCandidate = (data: { candidate: any; from: string }) => {
    const item = peersRef.current.find(p => p.peerID === data.from);
    if (item) item.peer.signal(data.candidate);
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
    }
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      const msg = { from: userId, text: newMessage.trim() };
      socketRef.current.emit('chat-message', { to: roomId, ...msg });
      // setMessages(prev => [...prev, msg]); // local echo
      setNewMessage('');
    }
  };

  return (
    <Layout>
      {/* Video Area */}
      <VideoSection>
        <VideoContainer>
          <div>
            <Video ref={userVideoRef} muted autoPlay playsInline />
            <div>You ({userId})</div>
          </div>
          {peers.map(peer => (
            <div key={peer.userId}>
              <Video
                ref={ref => {
                  if (ref && peer.peer) {
                    console.log('ref>>', ref, peer.peer);
                    
                    peer.peer.on('stream', (stream: MediaStream) => {
                      ref.srcObject = stream;
                    });
                  }
                }}
                autoPlay
                playsInline
              />
              <div>{peer.userId}</div>
            </div>
          ))}
        </VideoContainer>

        <Controls>
          <Button onClick={toggleAudio}>Microphone</Button>
          <Button onClick={toggleVideo}>Video</Button>
          <Button onClick={onLeave} color="#ea4335">PhoneSlash</Button>
        </Controls>
      </VideoSection>

      {/* Chat Area */}
      <ChatPanel>
        <ChatMessages>
          {messages.map((msg, idx) => (
            <div key={idx}><b>{msg.from}:</b> {msg.text}</div>
          ))}
        </ChatMessages>
        <ChatInputContainer>
          <ChatInput
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
          />
          <ChatButton onClick={sendMessage}>Comment </ChatButton>
        </ChatInputContainer>
      </ChatPanel>
    </Layout>
  );
};

export default VideoCall;
