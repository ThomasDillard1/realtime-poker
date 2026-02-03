import { useState, useEffect } from 'react';
import { GameStateDTO, ActionType, ClientMessage, HandCompletePayload, GameOverPayload, RoomDTO } from '../types';
import { CardDisplay } from './CardDisplay';

interface TableProps {
  gameState: GameStateDTO | null;
  playerId: string;
  room: RoomDTO;
  validActions: ActionType[];
  turnDeadline: number | null;
  handComplete: HandCompletePayload | null;
  gameOver: GameOverPayload | null;
  onSend: (message: ClientMessage) => void;
}

// Format hand rank for display
function formatHandRank(rank: string): string {
  const formatted: Record<string, string> = {
    'high-card': 'High Card',
    'pair': 'Pair',
    'two-pair': 'Two Pair',
    'three-of-a-kind': 'Three of a Kind',
    'straight': 'Straight',
    'flush': 'Flush',
    'full-house': 'Full House',
    'four-of-a-kind': 'Four of a Kind',
    'straight-flush': 'Straight Flush',
    'royal-flush': 'Royal Flush',
  };
  return formatted[rank] || rank;
}

export function Table({ gameState, playerId, room, validActions, turnDeadline, handComplete, gameOver, onSend }: TableProps) {
  const roomId = room.id;
  const roomName = room.name;
  const [betAmount, setBetAmount] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Apply full-screen styles when Table is mounted, restore on unmount
  useEffect(() => {
    const originalStyles = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyMargin: document.body.style.margin,
      bodyPadding: document.body.style.padding,
      bodyHeight: document.body.style.height,
    };

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100vh';

    return () => {
      document.documentElement.style.overflow = originalStyles.htmlOverflow;
      document.body.style.overflow = originalStyles.bodyOverflow;
      document.body.style.margin = originalStyles.bodyMargin;
      document.body.style.padding = originalStyles.bodyPadding;
      document.body.style.height = originalStyles.bodyHeight;
    };
  }, []);

  // Update timer countdown
  useEffect(() => {
    if (!turnDeadline) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [turnDeadline]);

  // Calculate seat positions around the table
  // Positions are relative to the poker table element (green felt area)
  // Need to account for: 12px brown border + 8px visible gap = 20px total offset
  const seatWidth = 160;
  const borderWidth = 4; // table border width
  const visibleGap = 8; // visible gap between seats and table edge
  const totalOffset = borderWidth + visibleGap; // 20px total

  // Always use 6-player layout so seat positions are stable
  // Index 0 = bottom center (current user), then clockwise
  const seatPositions = [
    { top: `calc(100% + ${totalOffset}px)`, left: '50%', transform: 'translateX(-50%)' },
    { top: '85%', right: `calc(100% + ${totalOffset}px)`, transform: 'translateY(-50%)' },
    { top: '15%', right: `calc(100% + ${totalOffset}px)`, transform: 'translateY(-50%)' },
    { bottom: `calc(100% + ${totalOffset}px)`, left: '50%', transform: 'translateX(-50%)' },
    { top: '15%', left: `calc(100% + ${totalOffset}px)`, transform: 'translateY(-50%)' },
    { top: '85%', left: `calc(100% + ${totalOffset}px)`, transform: 'translateY(-50%)' },
  ] as Array<{ top?: string; bottom?: string; left?: string; right?: string; transform: string }>;

  // If game is over, show the game over screen
  if (gameOver) {
    return (
      <GameOverView
        gameOver={gameOver}
        playerId={playerId}
        roomId={roomId}
        onSend={onSend}
      />
    );
  }

  // Pre-game view: show the poker table with seated players and Start/Leave buttons
  if (!gameState) {
    const maxPlayers = room.maxPlayers || 6;
    // Build seat assignments: current player at index 0, others in join order
    const myIndex = room.players.findIndex(p => p.id === playerId);
    const orderedPlayers = myIndex >= 0
      ? [room.players[myIndex], ...room.players.filter((_, i) => i !== myIndex)]
      : [...room.players];

    const handleStartGame = () => {
      onSend({ type: 'start-game', payload: { roomId } });
    };
    const handleLeaveRoom = () => {
      onSend({ type: 'leave-room', payload: { roomId, playerId } });
    };

    return (
      <div style={{ height: '100vh', overflow: 'hidden', background: 'linear-gradient(145deg, #1a472a 0%, #2d5a3d 40%, #1a472a 100%)' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100vw',
          overflow: 'visible',
          boxSizing: 'border-box',
        }}>
          {/* Poker Table */}
          <div style={{
            width: '700px',
            height: '280px',
            background: 'transparent',
            borderRadius: '150px / 100px',
            border: '4px solid rgba(255,255,255,0.6)',
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Seated players and empty seats */}
            {Array.from({ length: maxPlayers }).map((_, seatIndex) => {
              const position = seatPositions[seatIndex];
              const player = orderedPlayers[seatIndex];

              if (player) {
                const isYou = player.id === playerId;
                return (
                  <div key={player.id} style={{
                    position: 'absolute',
                    ...position,
                    width: `${seatWidth}px`,
                    zIndex: 10,
                    textAlign: 'center',
                  }}>
                    {/* Player Info Box */}
                    <div style={{
                      backgroundColor: '#f5f5f5',
                      border: '1px solid #ddd',
                      borderRadius: '10px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      overflow: 'hidden',
                      padding: '12px 14px',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '4px',
                      }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          {player.name}
                          {isYou && <span style={{ color: '#666', marginLeft: '4px', fontWeight: 'normal', fontSize: '11px' }}>(You)</span>}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#333',
                        fontWeight: '500',
                      }}>
                        ${player.chips}
                      </div>
                    </div>
                  </div>
                );
              }

              // Empty seat placeholder
              return (
                <div key={`empty-${seatIndex}`} style={{
                  position: 'absolute',
                  ...position,
                  width: `${seatWidth}px`,
                  zIndex: 10,
                  textAlign: 'center',
                }}>
                  <div style={{
                    backgroundColor: 'rgba(200,200,200,0.15)',
                    border: '2px dashed rgba(255,255,255,0.5)',
                    borderRadius: '10px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '20px 14px',
                    }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                        Open Seat
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Room name */}
            <div style={{
              color: 'rgba(255,255,255,0.15)',
              fontSize: '16px',
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              position: 'absolute',
              bottom: '20px',
            }}>
              {roomName}
            </div>

            {/* Players count */}
            <div style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {room.players.length} / {maxPlayers} players
            </div>

            {/* Start / Leave buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              zIndex: 20,
            }}>
              <button
                onClick={handleStartGame}
                disabled={room.players.length < 2}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: room.players.length < 2 ? '#666' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: room.players.length < 2 ? 'not-allowed' : 'pointer',
                  opacity: room.players.length < 2 ? 0.5 : 1,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                Start Game
              </button>
              <button
                onClick={handleLeaveRoom}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if current player is a winner (for showdown)
  const winnerIds = handComplete ? handComplete.winners.map(w => w.playerId) : [];
  const winnerAmounts: Record<string, number> = {};
  if (handComplete) {
    handComplete.winners.forEach(w => {
      winnerAmounts[w.playerId] = w.amount;
    });
  }

  const myPlayer = gameState.players.find(p => p.id === playerId);
  const myCurrentBet = myPlayer?.bet || 0;
  const toCall = gameState.currentBet - myCurrentBet;

  // Calculate minimum bet/raise (minimum raise is double the current bet)
  const minBet = gameState.currentBet === 0
    ? gameState.bigBlind
    : gameState.currentBet * 2;

  const handleAction = (action: ActionType, amount?: number) => {
    onSend({
      type: 'player-action',
      payload: {
        roomId: gameState.roomId,
        playerId,
        action: { playerId, action, amount },
      },
    });
    setBetAmount(0);
  };

  const isMyTurn = gameState.currentPlayerId === playerId;

  // Set initial bet amount when it's player's turn
  const effectiveMinBet = Math.min(minBet, (myPlayer?.chips || 0) + myCurrentBet);

  // Reorder players: current player at seat 0 (bottom center), others in their relative order
  const myGameIndex = gameState.players.findIndex(p => p.id === playerId);
  const orderedGamePlayers = myGameIndex >= 0
    ? [...gameState.players.slice(myGameIndex), ...gameState.players.slice(0, myGameIndex)]
    : gameState.players;

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'linear-gradient(145deg, #1a472a 0%, #2d5a3d 40%, #1a472a 100%)' }}>
      {/* Animations */}
      <style>
        {`
          @keyframes pulse-glow {
            0%, 100% {
              box-shadow: 0 0 6px rgba(255, 193, 7, 0.3), 0 0 12px rgba(255, 193, 7, 0.15);
            }
            50% {
              box-shadow: 0 0 10px rgba(255, 193, 7, 0.5), 0 0 20px rgba(255, 193, 7, 0.25);
            }
          }
          @keyframes winner-glow {
            0%, 100% {
              box-shadow: 0 0 6px rgba(76, 175, 80, 0.3), 0 0 12px rgba(76, 175, 80, 0.15);
            }
            50% {
              box-shadow: 0 0 10px rgba(76, 175, 80, 0.5), 0 0 20px rgba(76, 175, 80, 0.25);
            }
          }
          @keyframes confetti-fall {
            0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(150px) rotate(720deg); opacity: 0; }
          }
          @keyframes winner-bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes chips-float {
            0% { transform: translateY(0); opacity: 0; }
            20% { opacity: 1; }
            100% { transform: translateY(-30px); opacity: 0; }
          }
        `}
      </style>

      {/* Centering wrapper for the entire table area */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}>
        {/* Poker Table - serves as positioning context for player seats */}
        <div style={{
          width: '700px',
          height: '280px',
          background: 'transparent',
          borderRadius: '150px / 100px',
          border: '4px solid rgba(255,255,255,0.6)',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Player Seats - positioned relative to poker table */}
          {orderedGamePlayers.map((p, index) => {
            const position = seatPositions[index] || seatPositions[0];
            const isCurrentTurn = p.id === gameState.currentPlayerId && !handComplete;
            const isYou = p.id === playerId;
            const isFolded = p.status === 'folded';
            const isAllIn = p.status === 'all-in';
            const isWinner = winnerIds.includes(p.id);
            const winAmount = winnerAmounts[p.id];

            // Get showdown cards for this player (if available)
            const showdownPlayer = handComplete?.players.find(sp => sp.id === p.id);
            const showdownCards = handComplete?.isShowdown && isWinner && showdownPlayer?.hand;

            return (
              <div key={p.id} style={{
                position: 'absolute',
                ...position,
                width: `${seatWidth}px`,
                zIndex: isWinner ? 15 : 10,
                opacity: isFolded && !isWinner ? 0.4 : 1,
                transition: 'opacity 0.3s ease',
                textAlign: 'center',
              }}>
                {/* Confetti for winners */}
                {isWinner && (
                  <div style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                    {[...Array(12)].map((_, i) => (
                      <div key={i} style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        backgroundColor: ['#ffd700', '#4caf50', '#ff6b6b', '#4dabf7', '#ff922b'][i % 5],
                        borderRadius: i % 2 === 0 ? '50%' : '2px',
                        left: `${(i - 6) * 12}px`,
                        animation: `confetti-fall 2s ease-out ${i * 0.1}s infinite`,
                      }} />
                    ))}
                  </div>
                )}

                {/* Winner amount floating */}
                {isWinner && winAmount && (
                  <div style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    animation: 'winner-bounce 0.5s ease-in-out infinite',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    zIndex: 20,
                  }}>
                    +${winAmount}
                  </div>
                )}

                {/* Cards - floating above the info box */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '-35px',
                  position: 'relative',
                  zIndex: 2,
                }}>
                  {/* Show cards: your own cards, OR showdown winner cards */}
                  {(isYou && gameState.myCards && gameState.myCards.length > 0) ? (
                    // Show face-up cards for current player
                    gameState.myCards.map((card, i) => (
                      <div key={i} style={{
                        transform: i === 0 ? 'rotate(-4deg)' : 'rotate(4deg)',
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
                      }}>
                        <CardDisplay card={card} height="86px" />
                      </div>
                    ))
                  ) : showdownCards && showdownCards.length > 0 ? (
                    // Show face-up cards for showdown winners
                    showdownCards.map((card, i) => (
                      <div key={i} style={{
                        transform: i === 0 ? 'rotate(-4deg)' : 'rotate(4deg)',
                        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
                      }}>
                        <CardDisplay card={card} height="86px" />
                      </div>
                    ))
                  ) : (
                    // Show face-down cards for other players
                    <>
                      <div style={{
                        width: '62px',
                        height: '86px',
                        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                        borderRadius: '6px',
                        border: '1px solid #0d1442',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.3), inset 0 0 10px rgba(255,255,255,0.1)',
                        transform: 'rotate(-4deg)',
                      }} />
                      <div style={{
                        width: '62px',
                        height: '86px',
                        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                        borderRadius: '6px',
                        border: '1px solid #0d1442',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.3), inset 0 0 10px rgba(255,255,255,0.1)',
                        transform: 'rotate(4deg)',
                      }} />
                    </>
                  )}
                </div>

                {/* Player Info Box */}
                <div style={{
                  backgroundColor: isWinner ? '#e8f5e9' : isCurrentTurn ? '#fff8e1' : '#f5f5f5',
                  border: isWinner ? '2px solid #4caf50' : isCurrentTurn ? '2px solid #ffc107' : '1px solid #ddd',
                  borderRadius: '10px',
                  boxShadow: isWinner ? '0 0 20px rgba(76, 175, 80, 0.5)' : '0 2px 8px rgba(0,0,0,0.15)',
                  animation: isWinner ? 'winner-glow 1s ease-in-out infinite' : isCurrentTurn ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                  overflow: 'hidden',
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {/* Spacer for cards overlap */}
                  <div style={{ height: '40px' }} />

                  {/* Player Name & Position Badges */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    padding: '0 14px',
                  }}>
                    <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                      {p.name}
                      {isYou && <span style={{ color: '#666', marginLeft: '4px', fontWeight: 'normal', fontSize: '11px' }}>(You)</span>}
                    </span>
                    {(p.isDealer || p.isSmallBlind || p.isBigBlind) && (
                      <span style={{ fontSize: '10px' }}>
                        {p.isDealer && <span style={{ backgroundColor: '#333', color: '#fff', padding: '1px 5px', borderRadius: '3px', marginRight: '2px' }}>D</span>}
                        {p.isSmallBlind && <span style={{ backgroundColor: '#666', color: '#fff', padding: '1px 5px', borderRadius: '3px', marginRight: '2px' }}>SB</span>}
                        {p.isBigBlind && <span style={{ backgroundColor: '#999', color: '#fff', padding: '1px 5px', borderRadius: '3px' }}>BB</span>}
                      </span>
                    )}
                  </div>

                  {/* Chips & Bet Row */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    padding: '0 14px 10px 14px',
                  }}>
                    <span style={{ color: '#333', fontWeight: '500' }}>${p.chips}</span>
                    {p.bet > 0 && (
                      <span style={{
                        color: '#e65100',
                        fontWeight: 'bold',
                        backgroundColor: '#fff3e0',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}>
                        ${p.bet}
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  {isAllIn && (
                    <div style={{
                      fontSize: '10px',
                      color: '#fff',
                      backgroundColor: '#7b1fa2',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      marginBottom: '10px',
                      display: 'inline-block',
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      letterSpacing: '0.5px',
                    }}>
                      {p.status}
                    </div>
                  )}

                  {/* Action Timer at Bottom */}
                  {isCurrentTurn && timeRemaining !== null && (
                    <div style={{
                      width: '100%',
                      height: '4px',
                      backgroundColor: '#e0e0e0',
                    }}>
                      <div style={{
                        width: `${(timeRemaining / 30) * 100}%`,
                        height: '100%',
                        backgroundColor: timeRemaining <= 5 ? '#f44336' : timeRemaining <= 10 ? '#ff9800' : '#4caf50',
                        transition: 'width 0.1s linear, background-color 0.3s ease',
                      }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pot Display */}
          <div style={{
            color: '#ffd700',
            fontSize: '20px',
            fontWeight: 'bold',
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            marginBottom: '15px',
          }}>
            Pot: ${gameState.pot}
          </div>

          {/* Community Cards */}
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100px',
          }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const hasCard = !!gameState.communityCards[i];
              return (
                <div key={i} style={{
                  width: '62px',
                  height: '86px',
                  backgroundColor: 'transparent',
                  borderRadius: '6px',
                  border: hasCard ? 'none' : '2px dashed rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {hasCard && (
                    <CardDisplay card={gameState.communityCards[i]} height="86px" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Room Name (faded) */}
          <div style={{
            position: 'absolute',
            bottom: '20px',
            color: 'rgba(255,255,255,0.15)',
            fontSize: '16px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            {roomName}
          </div>

          {/* Showdown Overlay */}
          {handComplete && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              borderRadius: '150px / 100px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
            }}>
              {(() => {
                const { winners, isShowdown } = handComplete;
                const isWinner = winners.some(w => w.playerId === playerId);

                return (
                  <>
                    {/* Result Title */}
                    <div style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: isWinner ? '#4caf50' : '#fff',
                      marginBottom: '12px',
                      textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    }}>
                      {isWinner ? 'You Won!' : 'Hand Complete'}
                    </div>

                    {/* Winner Info */}
                    {winners.map((winner, i) => (
                      <div key={i} style={{
                        color: '#ffd700',
                        fontSize: '16px',
                        marginBottom: '8px',
                        textAlign: 'center',
                      }}>
                        <span style={{ fontWeight: 'bold' }}>
                          {gameState.players.find(p => p.id === winner.playerId)?.name || 'Unknown'}
                        </span>
                        {' wins '}
                        <span style={{ fontWeight: 'bold', color: '#4caf50' }}>
                          ${winner.amount}
                        </span>
                        {isShowdown && winner.handResult?.rank && (
                          <span style={{ color: '#fff' }}>
                            {' with '}{formatHandRank(winner.handResult.rank)}
                          </span>
                        )}
                      </div>
                    ))}

                    {/* Next Hand Indicator */}
                    <div style={{
                      marginTop: '16px',
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: '14px',
                    }}>
                      Next hand starting soon...
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Action panel - fixed at bottom right, compact square design */}
      {isMyTurn && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '12px',
          borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 100,
          width: '175px',
        }}>
          {/* Header */}
          <div style={{
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#333',
            textAlign: 'center',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid #eee',
          }}>
            Your Turn
          </div>

          {/* Buttons grid - all 4 always visible */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}>
            {/* Check button */}
            <button
              onClick={() => validActions.includes('check') && handleAction('check')}
              disabled={!validActions.includes('check')}
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#4caf50',
                color: 'white',
                cursor: validActions.includes('check') ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: validActions.includes('check') ? 1 : 0.35,
              }}>Check</button>

            {/* Call button */}
            <button
              onClick={() => validActions.includes('call') && handleAction('call')}
              disabled={!validActions.includes('call')}
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2196f3',
                color: 'white',
                cursor: validActions.includes('call') ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: validActions.includes('call') ? 1 : 0.35,
              }}>
              {validActions.includes('call') ? `Call $${toCall}` : 'Call'}
            </button>

            {/* Fold button */}
            <button
              onClick={() => validActions.includes('fold') && handleAction('fold')}
              disabled={!validActions.includes('fold')}
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#f44336',
                color: 'white',
                cursor: validActions.includes('fold') ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: validActions.includes('fold') ? 1 : 0.35,
              }}>Fold</button>

            {/* All-In button */}
            <button
              onClick={() => validActions.includes('all-in') && handleAction('all-in')}
              disabled={!validActions.includes('all-in')}
              style={{
                padding: '10px 8px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#9c27b0',
                color: 'white',
                cursor: validActions.includes('all-in') ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '13px',
                opacity: validActions.includes('all-in') ? 1 : 0.35,
              }}>
              All In
            </button>
          </div>

          {/* Bet/Raise section */}
          {(validActions.includes('bet') || validActions.includes('raise')) && (() => {
            const maxBet = (myPlayer?.chips || 0) + myCurrentBet;
            const currentBetValue = betAmount || effectiveMinBet;

            return (
              <div style={{ marginTop: '8px' }}>
                {/* Pot-based quick buttons */}
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  marginBottom: '6px',
                }}>
                  {[
                    { label: '1/2', mult: 0.5 },
                    { label: '3/4', mult: 0.75 },
                    { label: 'Pot', mult: 1 },
                  ].map(({ label, mult }) => {
                    const potBet = Math.floor(gameState.pot * mult);
                    const isDisabled = potBet < effectiveMinBet || potBet > maxBet;
                    const actualBet = Math.min(Math.max(potBet, effectiveMinBet), maxBet);
                    return (
                      <button
                        key={label}
                        onClick={() => !isDisabled && setBetAmount(actualBet)}
                        disabled={isDisabled}
                        style={{
                          flex: 1,
                          padding: '6px 4px',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                          backgroundColor: isDisabled ? '#f5f5f5' : '#f5f5f5',
                          color: isDisabled ? '#bbb' : '#333',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                          opacity: isDisabled ? 0.5 : 1,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Bet slider */}
                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="range"
                    min={effectiveMinBet}
                    max={maxBet}
                    value={currentBetValue}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      accentColor: '#ff9800',
                    }}
                  />
                </div>

                {/* Input and raise button */}
                <div style={{
                  display: 'flex',
                  gap: '6px',
                }}>
                  <input
                    type="number"
                    min={effectiveMinBet}
                    max={maxBet}
                    value={currentBetValue}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    style={{
                      width: '70px',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      fontSize: '13px',
                      textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => {
                      const amount = currentBetValue;
                      handleAction(validActions.includes('bet') ? 'bet' : 'raise', amount);
                    }}
                    disabled={currentBetValue < effectiveMinBet}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#ff9800',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px',
                    }}
                  >
                    {validActions.includes('bet') ? 'Bet' : 'Raise'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Game Over display component
interface GameOverViewProps {
  gameOver: GameOverPayload;
  playerId: string;
  roomId: string;
  onSend: (message: ClientMessage) => void;
}

function GameOverView({ gameOver, playerId, roomId, onSend }: GameOverViewProps) {
  const { winner, players } = gameOver;
  const isWinner = winner.id === playerId;

  const handleLeaveRoom = () => {
    onSend({
      type: 'leave-room',
      payload: { roomId, playerId },
    });
  };

  return (
    <div>
      <h2>Game Over!</h2>

      {/* Winner announcement */}
      <div style={{
        backgroundColor: isWinner ? '#e8f5e9' : '#fff8e1',
        padding: '20px',
        borderRadius: '8px',
        margin: '10px 0',
        border: `2px solid ${isWinner ? '#4caf50' : '#ffc107'}`,
        textAlign: 'center',
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: isWinner ? '#2e7d32' : '#f57f17', fontSize: '24px' }}>
          {isWinner ? '🏆 You Won the Game! 🏆' : `${winner.name} Wins!`}
        </h3>
        <p style={{ fontSize: '18px' }}>
          Final chips: <strong>{winner.chips}</strong>
        </p>
      </div>

      {/* Final standings */}
      <div>
        <h3>Final Standings</h3>
        <ol style={{ fontSize: '16px' }}>
          {players.map((p, index) => (
            <li
              key={p.id}
              style={{
                padding: '8px',
                marginBottom: '4px',
                backgroundColor: index === 0 ? '#fff9c4' : p.id === playerId ? '#e3f2fd' : 'transparent',
                borderRadius: '4px',
              }}
            >
              <strong>{p.name}</strong>
              {p.id === playerId && ' (You)'}
              {' - '}
              {p.chips} chips
              {index === 0 && ' 👑'}
              {p.chips === 0 && ' (Eliminated)'}
            </li>
          ))}
        </ol>
      </div>

      {/* Return to lobby button */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <button
          onClick={handleLeaveRoom}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
}
