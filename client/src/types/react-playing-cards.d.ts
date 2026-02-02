declare module '@heruka_urgyen/react-playing-cards/lib/TcN' {
  import { FC } from 'react';

  interface CardProps {
    card: string;
    height?: string;
  }

  const Card: FC<CardProps>;
  export default Card;
}
