import { WebSocketHandler } from './websocket/WebSocketServer.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

new WebSocketHandler(PORT);

console.log(`Poker server running on ws://localhost:${PORT}`);
