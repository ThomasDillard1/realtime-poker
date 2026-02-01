import { useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { RoomDTO, GameStateDTO, ActionType, PlayerDTO } from './types';

function App() {
  const { isConnected, lastMessage, send } = useWebSocket();
  const [room, setRoom] = useState<RoomDTO | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateDTO | null>(null);
  const [validActions, setValidActions] = useState<ActionType[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'room-created':
      case 'room-joined':
        setRoom(lastMessage.payload.room);
        if ('playerId' in lastMessage.payload) {
          setPlayerId(lastMessage.payload.playerId);
        }
        setError(null);
        break;

      case 'player-joined':
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: [...prev.players, lastMessage.payload.player as PlayerDTO],
          };
        });
        break;

      case 'player-left':
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.filter((p) => p.id !== lastMessage.payload.playerId),
          };
        });
        if (lastMessage.payload.playerId === playerId) {
          setRoom(null);
          setPlayerId(null);
          setGameState(null);
        }
        break;

      case 'game-started':
      case 'game-updated':
        setGameState(lastMessage.payload.gameState);
        break;

      case 'action-required':
        setValidActions(lastMessage.payload.validActions);
        break;

      case 'hand-complete':
        setGameState(lastMessage.payload.newGameState);
        break;

      case 'error':
        setError(lastMessage.payload.message);
        break;
    }
  }, [lastMessage, playerId]);

  return (
    <div>
      <h1>Poker</h1>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {gameState ? (
        <Table
          gameState={gameState}
          playerId={playerId!}
          validActions={validActions}
          onSend={send}
        />
      ) : (
        <Lobby onSend={send} room={room} playerId={playerId} />
      )}
    </div>
  );
}

export default App;
