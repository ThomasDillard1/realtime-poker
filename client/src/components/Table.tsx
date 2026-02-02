import { useState, useEffect } from 'react';
import { GameStateDTO, ActionType, ClientMessage, HandCompletePayload, ShowdownPlayerDTO, GameOverPayload } from '../types';
import { CardDisplay, CardHand } from './CardDisplay';

interface TableProps {
  gameState: GameStateDTO | null;
  playerId: string;
  roomId: string;
  roomName: string;
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

export function Table({ gameState, playerId, roomId, roomName, validActions, turnDeadline, handComplete, gameOver, onSend }: TableProps) {
  const [betAmount, setBetAmount] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

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

  // If hand is complete, show the showdown screen
  if (handComplete) {
    return (
      <ShowdownView
        handComplete={handComplete}
        playerId={playerId}
      />
    );
  }

  // If no game state, shouldn't happen but handle gracefully
  if (!gameState) {
    return <div>Waiting for game...</div>;
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

  // Calculate seat positions around the table based on number of players
  const getSeatPositions = (numPlayers: number) => {
    const positions: Array<{ top?: string; bottom?: string; left?: string; right?: string; transform: string }> = [];

    if (numPlayers === 2) {
      // Two players: top and bottom
      positions.push({ top: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
    } else if (numPlayers === 3) {
      positions.push({ top: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ bottom: '0', left: '25%', transform: 'translateX(-50%)' });
      positions.push({ bottom: '0', right: '25%', transform: 'translateX(50%)' });
    } else if (numPlayers === 4) {
      positions.push({ top: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ top: '50%', left: '0', transform: 'translateX(-50%) translateY(-50%)' });
      positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ top: '50%', right: '0', transform: 'translateX(50%) translateY(-50%)' });
    } else if (numPlayers === 5) {
      positions.push({ top: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ top: '30%', left: '0', transform: 'translateX(-50%) translateY(-50%)' });
      positions.push({ bottom: '0', left: '25%', transform: 'translateX(-50%)' });
      positions.push({ bottom: '0', right: '25%', transform: 'translateX(50%)' });
      positions.push({ top: '30%', right: '0', transform: 'translateX(50%) translateY(-50%)' });
    } else {
      // 6 players
      positions.push({ top: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ top: '30%', left: '0', transform: 'translateX(-50%) translateY(-50%)' });
      positions.push({ bottom: '30%', left: '0', transform: 'translateX(-50%) translateY(50%)' });
      positions.push({ bottom: '0', left: '50%', transform: 'translateX(-50%)' });
      positions.push({ bottom: '30%', right: '0', transform: 'translateX(50%) translateY(50%)' });
      positions.push({ top: '30%', right: '0', transform: 'translateX(50%) translateY(-50%)' });
    }

    return positions;
  };

  const seatPositions = getSeatPositions(gameState.players.length);

  return (
    <div>
      {/* Pulsing animation for active player */}
      <style>
        {`
          @keyframes pulse-glow {
            0%, 100% {
              box-shadow: 0 0 8px rgba(255, 193, 7, 0.4), 0 0 16px rgba(255, 193, 7, 0.2);
            }
            50% {
              box-shadow: 0 0 16px rgba(255, 193, 7, 0.6), 0 0 28px rgba(255, 193, 7, 0.3);
            }
          }
        `}
      </style>

      {/* Table Container with Player Seats */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '700px',
        margin: '20px auto 20px auto',
        padding: '90px 80px',
      }}>
        {/* Player Seats */}
        {gameState.players.map((p, index) => {
          const position = seatPositions[index] || seatPositions[0];
          const isCurrentTurn = p.id === gameState.currentPlayerId;
          const isYou = p.id === playerId;
          const isFolded = p.status === 'folded';
          const isAllIn = p.status === 'all-in';

          return (
            <div key={p.id} style={{
              position: 'absolute',
              ...position,
              backgroundColor: isCurrentTurn ? '#fff8e1' : '#f5f5f5',
              border: isCurrentTurn ? '2px solid #ffc107' : '1px solid #ddd',
              borderRadius: '10px',
              padding: '10px 14px',
              minWidth: '140px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 10,
              animation: isCurrentTurn ? 'pulse-glow 2s ease-in-out infinite' : 'none',
              opacity: isFolded ? 0.4 : 1,
              transition: 'opacity 0.3s ease',
            }}>
              {/* Cards Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '4px',
                marginBottom: '8px',
              }}>
                {isYou && gameState.myCards && gameState.myCards.length > 0 ? (
                  // Show face-up cards for current player
                  gameState.myCards.map((card, i) => (
                    <CardDisplay key={i} card={card} height="50px" />
                  ))
                ) : (
                  // Show face-down cards for other players (if not folded)
                  !isFolded && (
                    <>
                      <div style={{
                        width: '36px',
                        height: '50px',
                        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                        borderRadius: '4px',
                        border: '1px solid #0d1442',
                        boxShadow: 'inset 0 0 10px rgba(255,255,255,0.1)',
                      }} />
                      <div style={{
                        width: '36px',
                        height: '50px',
                        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                        borderRadius: '4px',
                        border: '1px solid #0d1442',
                        boxShadow: 'inset 0 0 10px rgba(255,255,255,0.1)',
                      }} />
                    </>
                  )
                )}
              </div>

              {/* Action Timer */}
              {isCurrentTurn && timeRemaining !== null && (
                <div style={{ marginBottom: '6px' }}>
                  <div style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#e0e0e0',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(timeRemaining / 30) * 100}%`,
                      height: '100%',
                      backgroundColor: timeRemaining <= 5 ? '#f44336' : timeRemaining <= 10 ? '#ff9800' : '#4caf50',
                      transition: 'width 0.1s linear, background-color 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: timeRemaining <= 5 ? '#f44336' : '#666',
                    marginTop: '2px',
                    fontWeight: timeRemaining <= 5 ? 'bold' : 'normal',
                  }}>
                    {timeRemaining}s
                  </div>
                </div>
              )}

              {/* Player Name & Position Badges */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginBottom: '4px',
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
              {(isFolded || isAllIn) && (
                <div style={{
                  fontSize: '10px',
                  color: '#fff',
                  backgroundColor: isFolded ? '#9e9e9e' : '#7b1fa2',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  marginTop: '4px',
                  display: 'inline-block',
                  textTransform: 'uppercase',
                  fontWeight: 'bold',
                  letterSpacing: '0.5px',
                }}>
                  {p.status}
                </div>
              )}
            </div>
          );
        })}

        {/* Poker Table */}
        <div style={{
          width: '100%',
          height: '280px',
          background: 'linear-gradient(145deg, #1a472a 0%, #2d5a3d 50%, #1a472a 100%)',
          borderRadius: '150px / 100px',
          border: '12px solid #5d4037',
          boxShadow: 'inset 0 0 50px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
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
                  backgroundColor: hasCard ? 'transparent' : 'rgba(0,0,0,0.2)',
                  borderRadius: '6px',
                  border: hasCard ? 'none' : '2px dashed rgba(255,255,255,0.2)',
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
        </div>
      </div>

      {isMyTurn && (
        <div>
          <h3>Your Turn</h3>
          <div>
            {validActions.includes('fold') && (
              <button onClick={() => handleAction('fold')}>Fold</button>
            )}
            {validActions.includes('check') && (
              <button onClick={() => handleAction('check')}>Check</button>
            )}
            {validActions.includes('call') && (
              <button onClick={() => handleAction('call')}>
                Call {toCall}
              </button>
            )}
            {validActions.includes('all-in') && (
              <button onClick={() => handleAction('all-in')}>
                All In ({myPlayer?.chips})
              </button>
            )}
          </div>

          {(validActions.includes('bet') || validActions.includes('raise')) && (
            <div style={{ marginTop: '10px' }}>
              <label>
                {validActions.includes('bet') ? 'Bet' : 'Raise to'}:{' '}
                <input
                  type="number"
                  min={effectiveMinBet}
                  max={(myPlayer?.chips || 0) + myCurrentBet}
                  value={betAmount || effectiveMinBet}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  style={{ width: '80px' }}
                />
              </label>
              <button
                onClick={() => {
                  const amount = betAmount || effectiveMinBet;
                  handleAction(validActions.includes('bet') ? 'bet' : 'raise', amount);
                }}
                disabled={betAmount > 0 && betAmount < effectiveMinBet}
              >
                {validActions.includes('bet') ? 'Bet' : 'Raise'}
              </button>
              <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                (min: {effectiveMinBet})
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Separate component for showdown/hand complete display
interface ShowdownViewProps {
  handComplete: HandCompletePayload;
  playerId: string;
}

function ShowdownView({ handComplete, playerId }: ShowdownViewProps) {
  const { winners, players, communityCards, pot, isShowdown } = handComplete;
  const [countdown, setCountdown] = useState(6);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  // Get player name by ID
  const getPlayerName = (id: string) => {
    const player = players.find(p => p.id === id);
    return player?.name || 'Unknown';
  };

  // Determine current player's outcome
  const myPlayer = players.find(p => p.id === playerId);
  const isWinner = winners.some(w => w.playerId === playerId);
  const hasFolded = myPlayer?.status === 'folded';

  // Set colors based on outcome
  let bannerBgColor = '#ffebee';  // Red (lost)
  let bannerBorderColor = '#f44336';
  let bannerTextColor = '#c62828';
  let bannerTitle = 'You Lost';

  if (isWinner) {
    bannerBgColor = '#e8f5e9';  // Green (won)
    bannerBorderColor = '#4caf50';
    bannerTextColor = '#2e7d32';
    bannerTitle = 'You Won!';
  } else if (hasFolded) {
    bannerBgColor = '#fff8e1';  // Yellow (folded)
    bannerBorderColor = '#ffc107';
    bannerTextColor = '#f57f17';
    bannerTitle = 'You Folded';
  }

  return (
    <div>
      <h2>Hand Complete!</h2>

      {/* Personalized result banner */}
      <div style={{
        backgroundColor: bannerBgColor,
        padding: '15px',
        borderRadius: '8px',
        margin: '10px 0',
        border: `2px solid ${bannerBorderColor}`
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: bannerTextColor }}>
          {bannerTitle}
        </h3>
        <p>Pot: {pot}</p>
        {winners.map((winner, i) => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <div>
              <strong>{getPlayerName(winner.playerId)}</strong>
              {winner.playerId === playerId && ' (You)'}
              {' wins '}
              <strong>{winner.amount}</strong>
              {' chips'}
              {isShowdown && winner.handResult.rank && (
                <>
                  {' with '}
                  <strong>{formatHandRank(winner.handResult.rank)}</strong>
                </>
              )}
            </div>
            {isShowdown && winner.handResult.cards.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <CardHand cards={winner.handResult.cards} height="60px" gap="4px" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Community Cards */}
      <div>
        <h3>Community Cards</h3>
        {communityCards.length > 0 ? (
          <CardHand cards={communityCards} height="80px" />
        ) : (
          <p style={{ color: '#666' }}>No cards</p>
        )}
      </div>

      {/* Player hands at showdown */}
      {isShowdown && (
        <div>
          <h3>Player Hands</h3>
          {players
            .filter((p): p is ShowdownPlayerDTO => p.hand && p.hand.length > 0)
            .map((p) => (
              <div key={p.id} style={{
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: winners.some(w => w.playerId === p.id) ? '#e8f5e9' : '#f5f5f5',
                borderRadius: '8px',
                border: winners.some(w => w.playerId === p.id) ? '2px solid #4caf50' : '1px solid #ddd',
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>{p.name}</strong>
                  {p.id === playerId && ' (You)'}
                  {' - '}{p.chips} chips
                  {winners.some(w => w.playerId === p.id) && <span style={{ color: '#4caf50', marginLeft: '10px' }}>WINNER!</span>}
                </div>
                <CardHand cards={p.hand} height="70px" />
              </div>
            ))}
        </div>
      )}

      {/* All players summary */}
      <div>
        <h3>Players</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              {p.name} - {p.chips} chips - {p.status}
              {p.id === playerId && ' (You)'}
              {p.chips === 0 && ' - OUT'}
            </li>
          ))}
        </ul>
      </div>

      {/* Next hand countdown */}
      <div style={{
        marginTop: '20px',
        padding: '10px 20px',
        backgroundColor: '#e3f2fd',
        borderRadius: '4px',
        textAlign: 'center',
        fontSize: '16px',
      }}>
        {countdown > 0 ? (
          <span>Next hand starting in <strong>{countdown}</strong>...</span>
        ) : (
          <span>Starting next hand...</span>
        )}
      </div>
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
