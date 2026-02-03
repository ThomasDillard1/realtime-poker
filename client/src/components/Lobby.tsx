import { useState } from 'react';
import { ClientMessage, RoomDTO } from '../types';

interface LobbyProps {
  onSend: (message: ClientMessage) => void;
  availableRooms: RoomDTO[];
  pendingRejoin: { roomId: string; playerId: string } | null;
}

export function Lobby({ onSend, availableRooms, pendingRejoin }: LobbyProps) {
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

  const canInteract = !!playerName;

  // Room browser + create room form
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #1a472a 0%, #2d5a3d 40%, #1a472a 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '60px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '480px',
        maxWidth: '90vw',
      }}>
        <h2 style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: '28px',
          fontWeight: 'bold',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: '30px',
        }}>
          Poker Lobby
        </h2>

        {/* Rejoin banner */}
        {pendingRejoin && (
          <div
            onClick={() => onSend({ type: 'rejoin-game', payload: pendingRejoin })}
            style={{
              marginBottom: '24px',
              padding: '14px 20px',
              backgroundColor: 'rgba(76, 175, 80, 0.15)',
              border: '1px solid rgba(76, 175, 80, 0.4)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'background-color 0.15s ease',
            }}
          >
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
              You have an active game
            </span>
            <span style={{
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '12px',
              backgroundColor: '#4caf50',
              padding: '6px 16px',
              borderRadius: '4px',
            }}>
              Rejoin
            </span>
          </div>
        )}

        {/* Player name input */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '500' }}>
            What would you like to be called?
          </label>
          <input
            type="text"
            placeholder="Name"
            value={playerName}
            maxLength={15}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '6px',
              padding: '10px 14px',
              fontSize: '14px',
              backgroundColor: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              color: '#fff',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Create Room */}
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '12px',
          }}>
            Host a Table
          </h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: '14px',
                backgroundColor: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                color: '#fff',
                outline: 'none',
              }}
            />
            <button
              onClick={handleCreateRoom}
              disabled={!playerName || !roomName}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 'bold',
                backgroundColor: playerName && roomName ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                color: playerName && roomName ? '#fff' : 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                cursor: playerName && roomName ? 'pointer' : 'not-allowed',
              }}
            >
              Host
            </button>
          </div>
        </div>

        {/* Available Rooms */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.15)',
          paddingTop: '24px',
        }}>
          <h3 style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '12px',
          }}>
            Available Rooms
          </h3>
          {availableRooms.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
              No rooms available. Host one to get started!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {availableRooms.map((r) => {
                const isJoinable = !r.inProgress && r.players.length < r.maxPlayers && canInteract;
                const buyIn = r.players.length > 0 ? r.players[0].chips : null;
                return (
                  <div
                    key={r.id}
                    onClick={() => isJoinable && handleJoinRoom(r.id)}
                    style={{
                      padding: '14px 16px',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      cursor: isJoinable ? 'pointer' : 'not-allowed',
                      opacity: isJoinable ? 1 : 0.5,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{r.name}</span>
                        <span style={{ marginLeft: '10px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                          {r.players.length}/{r.maxPlayers} players
                        </span>
                      </div>
                      <div>
                        {r.inProgress ? (
                          <span style={{
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            backgroundColor: '#f57c00',
                            padding: '4px 12px',
                            borderRadius: '4px',
                          }}>In Progress</span>
                        ) : r.players.length >= r.maxPlayers ? (
                          <span style={{
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            backgroundColor: '#f44336',
                            padding: '4px 12px',
                            borderRadius: '4px',
                          }}>Full</span>
                        ) : (
                          <span style={{
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            backgroundColor: '#4caf50',
                            padding: '4px 12px',
                            borderRadius: '4px',
                          }}>Join</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                      Blinds: {r.smallBlind}/{r.bigBlind}
                      {buyIn != null && <span style={{ marginLeft: '10px' }}>Buy-in: ${buyIn}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
