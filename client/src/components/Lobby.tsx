import { useState } from 'react';
import { ClientMessage, RoomDTO } from '../types';

interface LobbyProps {
  onSend: (message: ClientMessage) => void;
  room: RoomDTO | null;
  playerId: string | null;
  availableRooms: RoomDTO[];
}

export function Lobby({ onSend, room, playerId, availableRooms }: LobbyProps) {
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');

  const handleCreateRoom = () => {
    if (playerName && roomName) {
      onSend({ type: 'create-room', payload: { roomName, playerName } });
    }
  };

  const handleJoinRoom = (roomId: string) => {
    if (playerName) {
      onSend({ type: 'join-room', payload: { roomId, playerName } });
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

  // Player is in a room - show room view
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

  // Player is not in a room - show lobby with room list
  return (
    <div>
      <h2>Poker Lobby</h2>

      {/* Player name input */}
      <div style={{ marginBottom: '20px' }}>
        <label>
          Your Name:{' '}
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{ padding: '8px', fontSize: '14px' }}
          />
        </label>
        {!playerName && (
          <p style={{ color: '#666', fontSize: '12px', margin: '5px 0' }}>
            Enter your name to create or join a room
          </p>
        )}
      </div>

      {/* Available Rooms */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Available Rooms</h3>
        {availableRooms.length === 0 ? (
          <p style={{ color: '#666' }}>No rooms available. Create one below!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {availableRooms.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: '12px',
                  margin: '8px 0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: r.inProgress ? '#f5f5f5' : '#fff',
                  cursor: r.inProgress || r.players.length >= r.maxPlayers || !playerName ? 'not-allowed' : 'pointer',
                  opacity: r.inProgress || r.players.length >= r.maxPlayers || !playerName ? 0.6 : 1,
                }}
                onClick={() => {
                  if (!r.inProgress && r.players.length < r.maxPlayers && playerName) {
                    handleJoinRoom(r.id);
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{r.name}</strong>
                    <span style={{ marginLeft: '10px', color: '#666' }}>
                      {r.players.length}/{r.maxPlayers} players
                    </span>
                  </div>
                  <div>
                    {r.inProgress ? (
                      <span style={{ color: '#f57c00', fontWeight: 'bold' }}>In Progress</span>
                    ) : r.players.length >= r.maxPlayers ? (
                      <span style={{ color: '#d32f2f' }}>Full</span>
                    ) : (
                      <span style={{ color: '#388e3c' }}>Join</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                  Blinds: {r.smallBlind}/{r.bigBlind}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create Room */}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '20px' }}>
        <h3>Create New Room</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            style={{ padding: '8px', fontSize: '14px' }}
          />
          <button
            onClick={handleCreateRoom}
            disabled={!playerName || !roomName}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              cursor: playerName && roomName ? 'pointer' : 'not-allowed',
            }}
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}
