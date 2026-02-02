import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { RoomDTO, GameStateDTO, ActionType, PlayerDTO, ServerMessage, HandCompletePayload } from './types';

function App() {
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateDTO | null>(null);
  const [validActions, setValidActions] = useState<ActionType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [handComplete, setHandComplete] = useState<HandCompletePayload | null>(null);

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
            setRoom(null);
            setGameState(null);
            return null;
          }
          return currentPlayerId;
        });
        break;

      case 'game-started':
        setGameState(message.payload.gameState);
        setHandComplete(null); // Clear previous hand result
        setValidActions([]);
        break;

      case 'game-updated':
        setGameState(message.payload.gameState);
        break;

      case 'action-required':
        setValidActions(message.payload.validActions);
        break;

      case 'hand-complete':
        setHandComplete(message.payload);
        setGameState(null); // Game state cleared after hand completes
        setValidActions([]);
        break;

      case 'error':
        setError(message.payload.message);
        break;
    }
  }, []);

  const { isConnected, send } = useWebSocket(handleMessage);

  return (
    <div>
      <h1>Poker</h1>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {gameState || handComplete ? (
        <Table
          gameState={gameState}
          playerId={playerId!}
          validActions={validActions}
          handComplete={handComplete}
          onSend={send}
        />
      ) : (
        <Lobby onSend={send} room={room} playerId={playerId} />
      )}
    </div>
  );
}

export default App;
