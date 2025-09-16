import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ICE_SERVERS } from '../utils/webrtc';

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
}: {
  roomId: string;
  userId: string;
}) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RemotePeer>>({}); // key: socketId
  const [, setRenderTick] = useState(0); // force rerender when peers change

  useEffect(() => {
    const s = io(SIGNAL_SERVER);
    setSocket(s);

    let mounted = true;

    const start = async () => {
      console.log('Starting connection to signaling server...');
      // lấy stream local
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // s.on('connect', () => {
        s.emit('join-room', { roomId, userId });
      // });

      // existing peers (sent to new user) -> tạo RTCPeerConnection và tạo offer tới họ
      s.on(
        'existing-peer',
        async (payload: { socketId: string; userId?: string | null }) => {
          const { socketId, userId: theirUserId } = payload;
          // tạo peer connection & add track
          const pc = createPeerConnection(socketId, s);
          localStreamRef.current
            ?.getTracks()
            .forEach(t => pc.addTrack(t, localStreamRef.current!));
          peersRef.current[socketId] = { socketId, userId: theirUserId, pc };
          // tạo offer (we are initiator to existing peer)
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

      // new peer -> khi người khác vừa join, họ đã được thông báo; chúng ta sẽ chờ họ gửi offer hoặc họ sẽ nhận offer từ chúng ta
      s.on(
        'new-peer',
        async (payload: { socketId: string; userId?: string | null }) => {
          const { socketId, userId: theirUserId } = payload;
          // tạo pc nhưng do họ mới join, họ có thể tạo offer tới chúng ta. Chúng ta chỉ chuẩn bị PC.
          const pc = createPeerConnection(socketId, s);
          localStreamRef.current
            ?.getTracks()
            .forEach(t => pc.addTrack(t, localStreamRef.current!));
          peersRef.current[socketId] = { socketId, userId: theirUserId, pc };
          setRenderTick(t => t + 1);
        }
      );

      // nhận signaling messages (offer/answer/candidate)
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
            // nếu chưa có peer (nếu chúng ta chưa được thông báo) — tạo pc
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
        // nhận remote stream
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
      mounted = false;
      // leave room
      s.emit('leave-room', { roomId });
      // close peers
      Object.values(peersRef.current).forEach(p => {
        try {
          p.pc.close();
        } catch (e) {}
      });
      peersRef.current = {};
      // stop local tracks
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      s.disconnect();
    };
  }, [roomId, userId]);

  // Render
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
    <div>
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
    </div>
  );
}
