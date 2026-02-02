import { useState, useEffect } from 'react';
import { GameStateDTO, ActionType, ClientMessage, HandCompletePayload, ShowdownPlayerDTO, GameOverPayload } from '../types';
import { CardDisplay, CardHand } from './CardDisplay';

interface TableProps {
  gameState: GameStateDTO | null;
  playerId: string;
  roomId: string;
  roomName: string;
  validActions: ActionType[];
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

export function Table({ gameState, playerId, roomId, roomName, validActions, handComplete, gameOver, onSend }: TableProps) {
  const [betAmount, setBetAmount] = useState<number>(0);

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

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>{roomName}</h2>

      {/* Poker Table */}
      <div style={{
        width: '100%',
        maxWidth: '600px',
        height: '280px',
        margin: '0 auto 30px auto',
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
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              width: '62px',
              height: '86px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '6px',
              border: '2px dashed rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {gameState.communityCards[i] && (
                <CardDisplay card={gameState.communityCards[i]} height="82px" />
              )}
            </div>
          ))}
        </div>

        {/* Current Bet Display */}
        {gameState.currentBet > 0 && (
          <div style={{
            color: '#fff',
            fontSize: '14px',
            marginTop: '15px',
            opacity: 0.8,
          }}>
            Current Bet: ${gameState.currentBet}
          </div>
        )}
      </div>

      {/* Your Cards */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h3>Your Cards</h3>
        {gameState.myCards && gameState.myCards.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CardHand cards={gameState.myCards} height="110px" />
          </div>
        ) : (
          <p style={{ color: '#666' }}>No cards</p>
        )}
      </div>

      {/* Players */}
      <div>
        <h3>Players</h3>
        <ul>
          {gameState.players.map((p) => (
            <li key={p.id}>
              {p.name} - {p.chips} chips - bet: {p.bet} - {p.status}
              {p.isDealer && ' (D)'}
              {p.isSmallBlind && ' (SB)'}
              {p.isBigBlind && ' (BB)'}
              {p.id === gameState.currentPlayerId && ' <-- Turn'}
              {p.id === playerId && ' (You)'}
            </li>
          ))}
        </ul>
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
