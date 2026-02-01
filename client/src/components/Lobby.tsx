import { useState } from 'react';
import { ClientMessage, RoomDTO } from '../types';

interface LobbyProps {
  onSend: (message: ClientMessage) => void;
  room: RoomDTO | null;
  playerId: string | null;
}

export function Lobby({ onSend, room, playerId }: LobbyProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomIdToJoin, setRoomIdToJoin] = useState('');

  const handleCreateRoom = () => {
    if (playerName && roomName) {
      onSend({ type: 'create-room', payload: { roomName, playerName } });
    }
  };

  const handleJoinRoom = () => {
    if (playerName && roomIdToJoin) {
      onSend({ type: 'join-room', payload: { roomId: roomIdToJoin, playerName } });
    }
  };

  const handleStartGame = () => {
    if (room) {
      onSend({ type: 'start-game', payload: { roomId: room.id } });
    }
  };

  const handleLeaveRoom = () => {
    if (room && playerId) {
      onSend({ type: 'leave-room', payload: { roomId: room.id, playerId } });
    }
  };

  if (room) {
    return (
      <div>
        <h2>Room: {room.name}</h2>
        <p>Room ID: {room.id}</p>
        <p>Players ({room.players.length}/{room.maxPlayers}):</p>
        <ul>
          {room.players.map((p) => (
            <li key={p.id}>
              {p.name} - {p.chips} chips
              {p.id === playerId && ' (You)'}
            </li>
          ))}
        </ul>
        <button onClick={handleStartGame} disabled={room.players.length < 2}>
          Start Game
        </button>
        <button onClick={handleLeaveRoom}>Leave Room</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Poker Lobby</h2>
      <div>
        <input
          type="text"
          placeholder="Your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
      </div>
      <div>
        <h3>Create Room</h3>
        <input
          type="text"
          placeholder="Room name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
        <button onClick={handleCreateRoom}>Create</button>
      </div>
      <div>
        <h3>Join Room</h3>
        <input
          type="text"
          placeholder="Room ID"
          value={roomIdToJoin}
          onChange={(e) => setRoomIdToJoin(e.target.value)}
        />
        <button onClick={handleJoinRoom}>Join</button>
      </div>
    </div>
  );
}
