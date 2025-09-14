import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import styled from 'styled-components';
import { FaMicrophone, FaVideo, FaPhoneSlash, FaDesktop, FaComment, FaUsers } from 'react-icons/fa';

const VideoContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  padding: 20px;
`;

const Video = styled.video`
  width: 100%;
  border-radius: 10px;
  background-color: #1e1e1e;
`;

const Controls = styled.div`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 15px;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 15px;
  border-radius: 50px;
`;

const Button = styled.button`
  background-color: ${props => props.color || '#3c4043'};
  border: none;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  
  &:hover {
    opacity: 0.8;
  }
`;

interface VideoCallProps {
  roomId: string;
  userId: string;
  onLeave: () => void;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, userId, onLeave }) => {
  const [peers, setPeers] = useState<any[]>([]);
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
          peersRef.current.push({
            peerID: data.userId,
            peer,
          });
          setPeers(users => [...users, { userId: data.userId, peer }]);
        });

        socketRef.current.on('current-participants', (participants: string[]) => {
          const peers: any[] = [];
          participants.forEach(participantId => {
            const peer = createPeer(participantId, socketRef.current.id, stream);
            peersRef.current.push({
              peerID: participantId,
              peer,
            });
            peers.push({ userId: participantId, peer });
          });
          setPeers(peers);
        });

        socketRef.current.on('user-disconnected', (data: { userId: string }) => {
          const peerObj = peersRef.current.find(p => p.peerID === data.userId);
          if (peerObj) {
            peerObj.peer.destroy();
          }
          setPeers(peers => peers.filter(p => p.userId !== data.userId));
          peersRef.current = peersRef.current.filter(p => p.peerID !== data.userId);
        });

        socketRef.current.on('offer', handleOffer);
        socketRef.current.on('answer', handleAnswer);
        socketRef.current.on('ice-candidate', handleIceCandidate);
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
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

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

    peersRef.current.push({
      peerID: data.from,
      peer,
    });

    setPeers(users => [...users, { userId: data.from, peer }]);
  };

  const addPeer = (incomingSignal: any, callerID: string, stream: MediaStream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

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
    if (item) {
      item.peer.signal(data.answer);
    }
  };

  const handleIceCandidate = (data: { candidate: any; from: string }) => {
    const item = peersRef.current.find(p => p.peerID === data.from);
    if (item) {
      item.peer.signal(data.candidate);
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
      }
    }
  };

  return (
    <div>
      <VideoContainer>
        <div>
          <Video ref={userVideoRef} muted autoPlay playsInline />
          <div>You ({userId})</div>
        </div>
        {peers.map(peer => (
          <div key={peer.userId}>
            <Video ref={ref => { if (ref && peer.peer) peer.peer.on('stream', (stream: MediaStream) => { ref.srcObject = stream }); }} autoPlay playsInline />
            <div>{peer.userId}</div>
          </div>
        ))}
      </VideoContainer>
      <Controls>
        <Button onClick={toggleAudio} color="#3c4043">
          {/* <FaMicrophone /> */}
          Micro Phone Icon
        </Button>
        <Button onClick={toggleVideo} color="#3c4043">
          {/* <FaVideo /> */}
          Video Icon
        </Button>
        <Button onClick={onLeave} color="#ea4335">
          {/* <FaPhoneSlash />
           */}
           Phone Icon
        </Button>
      </Controls>
    </div>
  );
};

export default VideoCall;