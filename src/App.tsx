import React, { useState } from 'react';
import VideoCall from './components/VideoCall';
import styled from 'styled-components';

const Container = styled.div`
  text-align: center;
  background-color: #1e1e1e;
  min-height: 100vh;
  color: white;
`;

const Header = styled.header`
  padding: 20px;
  background-color: #2d2d2d;
`;

const JoinForm = styled.div`
  margin: 50px auto;
  max-width: 400px;
  padding: 20px;
  background-color: #2d2d2d;
  border-radius: 10px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  margin: 10px 0;
  border: none;
  border-radius: 5px;
`;

const Button = styled.button`
  background-color: #0b57d0;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  margin-top: 10px;
  
  &:hover {
    background-color: #0d47a1;
  }
`;

function App() {
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');

  const joinCall = () => {
    if (roomId && userId) {
      setInCall(true);
    }
  };

  return (
    <Container>
      <Header>
        <h1>MeetClone</h1>
      </Header>
      
      {inCall ? (
        <VideoCall 
          roomId={roomId} 
          userId={userId} 
          onLeave={() => setInCall(false)} 
        />
      ) : (
        <JoinForm>
          <h2>Join a Meeting</h2>
          <Input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <Input
            type="text"
            placeholder="Your Name"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <Button onClick={joinCall}>Join Meeting</Button>
        </JoinForm>
      )}
    </Container>
  );
}

export default App;