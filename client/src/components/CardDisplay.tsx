import Card from '@heruka_urgyen/react-playing-cards/lib/TcN';
import { Card as CardType } from '../types';

interface CardDisplayProps {
  card: CardType;
  height?: string;
}

// Convert our card format to library format
// Our format: { rank: '2'|'3'|...|'10'|'J'|'Q'|'K'|'A', suit: 'hearts'|'diamonds'|'clubs'|'spades' }
// Library format: "2c", "Th", "Kd", "As" (T for 10, lowercase suit initial)
function toLibraryFormat(card: CardType): string {
  // Convert rank (10 becomes T)
  const rankMap: Record<string, string> = {
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6',
    '7': '7', '8': '8', '9': '9', '10': 'T',
    'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
  };

  // Convert suit to lowercase initial
  const suitMap: Record<string, string> = {
    'clubs': 'c',
    'diamonds': 'd',
    'hearts': 'h',
    'spades': 's',
  };

  return rankMap[card.rank] + suitMap[card.suit];
}

export function CardDisplay({ card, height = '100px' }: CardDisplayProps) {
  const cardCode = toLibraryFormat(card);
  return <Card card={cardCode} height={height} />;
}

// Display multiple cards in a row
interface CardHandProps {
  cards: CardType[];
  height?: string;
  gap?: string;
}

export function CardHand({ cards, height = '100px', gap = '8px' }: CardHandProps) {
  return (
    <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>
      {cards.map((card, i) => (
        <CardDisplay key={i} card={card} height={height} />
      ))}
    </div>
  );
}
