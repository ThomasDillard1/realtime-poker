import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { RoomDTO, GameStateDTO, ActionType, PlayerDTO, ServerMessage, HandCompletePayload, GameOverPayload } from './types';

function App() {
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateDTO | null>(null);
  const [validActions, setValidActions] = useState<ActionType[]>([]);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handComplete, setHandComplete] = useState<HandCompletePayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [availableRooms, setAvailableRooms] = useState<RoomDTO[]>([]);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'room-created':
      case 'room-joined':
        setRoom(message.payload.room);
        if ('playerId' in message.payload) {
          setPlayerId(message.payload.playerId);
        }
        setError(null);
        break;

      case 'player-joined':
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: [...prev.players, message.payload.player as PlayerDTO],
          };
        });
        break;

      case 'player-left':
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.filter((p) => p.id !== message.payload.playerId),
          };
        });
        setPlayerId((currentPlayerId) => {
          if (message.payload.playerId === currentPlayerId) {
            // Player is leaving - clear all game state
            setRoom(null);
            setGameState(null);
            setGameOver(null);
            setHandComplete(null);
            setValidActions([]);
            return null;
          }
          return currentPlayerId;
        });
        break;

      case 'game-started':
        setGameState(message.payload.gameState);
        setHandComplete(null); // Clear previous hand result
        setGameOver(null); // Clear game over state
        setValidActions([]);
        break;

      case 'game-updated':
        setGameState(message.payload.gameState);
        break;

      case 'action-required':
        setValidActions(message.payload.validActions);
        setTurnDeadline(message.payload.turnDeadline);
        break;

      case 'hand-complete':
        setHandComplete(message.payload);
        // Keep gameState so the table remains visible during showdown
        setValidActions([]);
        setTurnDeadline(null);
        break;

      case 'rooms-list':
        setAvailableRooms(message.payload.rooms);
        break;

      case 'game-over':
        setGameOver(message.payload);
        setGameState(null);
        setHandComplete(null);
        setValidActions([]);
        setTurnDeadline(null);
        break;

      case 'error':
        setError(message.payload.message);
        break;
    }
  }, []);

  const { isConnected, send } = useWebSocket(handleMessage);

  // Request rooms list when connected and not in a room
  useEffect(() => {
    if (isConnected && !room) {
      send({ type: 'get-rooms', payload: {} });
    }
  }, [isConnected, room, send]);

  return (
    <div>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {room ? (
        <Table
          gameState={gameState}
          playerId={playerId!}
          room={room}
          validActions={validActions}
          turnDeadline={turnDeadline}
          handComplete={handComplete}
          gameOver={gameOver}
          onSend={send}
        />
      ) : (
        <Lobby onSend={send} availableRooms={availableRooms} />
      )}
    </div>
  );
}

export default App;
