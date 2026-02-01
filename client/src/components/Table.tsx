import { GameStateDTO, ActionType, ClientMessage } from '../types';

interface TableProps {
  gameState: GameStateDTO;
  playerId: string;
  validActions: ActionType[];
  onSend: (message: ClientMessage) => void;
}

export function Table({ gameState, playerId, validActions, onSend }: TableProps) {
  const handleAction = (action: ActionType, amount?: number) => {
    onSend({
      type: 'player-action',
      payload: {
        roomId: gameState.roomId,
        playerId,
        action: { playerId, action, amount },
      },
    });
  };

  const isMyTurn = gameState.currentPlayerId === playerId;

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
          {validActions.includes('fold') && (
            <button onClick={() => handleAction('fold')}>Fold</button>
          )}
          {validActions.includes('check') && (
            <button onClick={() => handleAction('check')}>Check</button>
          )}
          {validActions.includes('call') && (
            <button onClick={() => handleAction('call')}>Call</button>
          )}
          {validActions.includes('bet') && (
            <button onClick={() => handleAction('bet', gameState.currentBet || 20)}>Bet</button>
          )}
          {validActions.includes('raise') && (
            <button onClick={() => handleAction('raise', gameState.currentBet * 2)}>Raise</button>
          )}
          {validActions.includes('all-in') && (
            <button onClick={() => handleAction('all-in')}>All In</button>
          )}
        </div>
      )}
    </div>
  );
}
