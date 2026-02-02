import { useState } from 'react';
import { GameStateDTO, ActionType, ClientMessage } from '../types';

interface TableProps {
  gameState: GameStateDTO;
  playerId: string;
  validActions: ActionType[];
  onSend: (message: ClientMessage) => void;
}

export function Table({ gameState, playerId, validActions, onSend }: TableProps) {
  const [betAmount, setBetAmount] = useState<number>(0);

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
      <h2>Poker Table</h2>
      <p>Phase: {gameState.phase}</p>
      <p>Pot: {gameState.pot}</p>
      <p>Current Bet: {gameState.currentBet}</p>

      <div>
        <h3>Community Cards</h3>
        <div>
          {gameState.communityCards.map((card, i) => (
            <span key={i}>
              {card.rank}{card.suit[0].toUpperCase()}{' '}
            </span>
          ))}
          {gameState.communityCards.length === 0 && <span>No cards yet</span>}
        </div>
      </div>

      <div>
        <h3>Your Cards</h3>
        <div>
          {gameState.myCards?.map((card, i) => (
            <span key={i}>
              {card.rank}{card.suit[0].toUpperCase()}{' '}
            </span>
          ))}
        </div>
      </div>

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
