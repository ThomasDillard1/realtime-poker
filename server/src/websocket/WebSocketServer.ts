import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage, Player, PlayerDTO, RoomDTO, GameStateDTO, Room } from '../types/index.js';
import { gameManager } from '../game/GameManager.js';
import { startGame, getValidActions } from '../game/GameEngine.js';

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  roomId: string | null;
}

export class WebSocketHandler {
  private wss: WSServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();

  constructor(port: number) {
    this.wss = new WSServer({ port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log(`[${new Date().toISOString()}] Client connected`);
      this.clients.set(ws, { ws, playerId: null, roomId: null });

      ws.on('message', (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        const client = this.clients.get(ws);
        if (client?.playerId && client?.roomId) {
          gameManager.removePlayerFromRoom(client.roomId, client.playerId);
          this.broadcastToRoom(client.roomId, {
            type: 'player-left',
            payload: { roomId: client.roomId, playerId: client.playerId },
          });
        }
        this.clients.delete(ws);
        console.log(`[${new Date().toISOString()}] Client disconnected`);
      });
    });

    console.log(`WebSocket server started on port ${this.wss.options.port}`);
  }

  private handleMessage(ws: WebSocket, message: ClientMessage): void {
    switch (message.type) {
      case 'create-room':
        this.handleCreateRoom(ws, message.payload);
        break;
      case 'join-room':
        this.handleJoinRoom(ws, message.payload);
        break;
      case 'leave-room':
        this.handleLeaveRoom(ws, message.payload);
        break;
      case 'start-game':
        this.handleStartGame(ws, message.payload);
        break;
      case 'player-action':
        this.handlePlayerAction(ws, message.payload);
        break;
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  private handleCreateRoom(ws: WebSocket, payload: { roomName: string; playerName: string }): void {
    const room = gameManager.createRoom(payload.roomName);
    const player = this.createPlayer(payload.playerName);

    gameManager.addPlayerToRoom(room.id, player);

    const client = this.clients.get(ws);
    if (client) {
      client.playerId = player.id;
      client.roomId = room.id;
    }

    const roomDTO = this.toRoomDTO(room);
    this.send(ws, {
      type: 'room-created',
      payload: { room: roomDTO },
    });
    this.send(ws, {
      type: 'room-joined',
      payload: { room: roomDTO, playerId: player.id },
    });
  }

  private handleJoinRoom(ws: WebSocket, payload: { roomId: string; playerName: string }): void {
    const room = gameManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(ws, 'Room not found');
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      this.sendError(ws, 'Room is full');
      return;
    }

    if (room.gameState) {
      this.sendError(ws, 'Game already in progress');
      return;
    }

    const player = this.createPlayer(payload.playerName);
    gameManager.addPlayerToRoom(room.id, player);

    const client = this.clients.get(ws);
    if (client) {
      client.playerId = player.id;
      client.roomId = room.id;
    }

    this.broadcastToRoom(room.id, {
      type: 'player-joined',
      payload: { roomId: room.id, player: this.toPlayerDTO(player) },
    });

    this.send(ws, {
      type: 'room-joined',
      payload: { room: this.toRoomDTO(room), playerId: player.id },
    });
  }

  private handleLeaveRoom(ws: WebSocket, payload: { roomId: string; playerId: string }): void {
    gameManager.removePlayerFromRoom(payload.roomId, payload.playerId);

    // Broadcast to room before clearing client's roomId
    this.broadcastToRoom(payload.roomId, {
      type: 'player-left',
      payload: { roomId: payload.roomId, playerId: payload.playerId },
    });

    // Now clear the client's association
    const client = this.clients.get(ws);
    if (client) {
      client.playerId = null;
      client.roomId = null;
    }
  }

  private handleStartGame(ws: WebSocket, payload: { roomId: string }): void {
    const room = gameManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(ws, 'Room not found');
      return;
    }

    if (room.players.size < 2) {
      this.sendError(ws, 'Need at least 2 players to start');
      return;
    }

    if (room.gameState) {
      this.sendError(ws, 'Game already in progress');
      return;
    }

    // Initialize game state
    room.gameState = startGame(room);

    // Send personalized game state to each player
    this.broadcastGameState(room);

    // Send action-required to current player
    const currentPlayerId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
    const currentPlayer = room.players.get(currentPlayerId)!;
    const validActions = getValidActions(room.gameState, currentPlayer);

    this.broadcastToRoom(room.id, {
      type: 'action-required',
      payload: { playerId: currentPlayerId, validActions },
    });

    console.log(`[${new Date().toISOString()}] Game started in room ${room.id}`);
  }

  private handlePlayerAction(_ws: WebSocket, _payload: { roomId: string; playerId: string; action: unknown }): void {
    // TODO: Implement player action logic
  }

  private createPlayer(name: string): Player {
    return {
      id: Math.random().toString(36).substring(2, 9),
      name,
      chips: 1000,
      bet: 0,
      hand: [],
      status: 'waiting',
      isDealer: false,
      isSmallBlind: false,
      isBigBlind: false,
    };
  }

  private toPlayerDTO(player: Player): PlayerDTO {
    return {
      id: player.id,
      name: player.name,
      chips: player.chips,
      bet: player.bet,
      handSize: player.hand.length,
      status: player.status,
      isDealer: player.isDealer,
      isSmallBlind: player.isSmallBlind,
      isBigBlind: player.isBigBlind,
    };
  }

  private toRoomDTO(room: { id: string; name: string; players: Map<string, Player>; maxPlayers: number; smallBlind: number; bigBlind: number; gameState: unknown }): RoomDTO {
    return {
      id: room.id,
      name: room.name,
      players: Array.from(room.players.values()).map((p) => this.toPlayerDTO(p)),
      maxPlayers: room.maxPlayers,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      inProgress: room.gameState !== null,
    };
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    this.send(ws, { type: 'error', payload: { message: errorMessage } });
  }

  private broadcastToRoom(roomId: string, message: ServerMessage): void {
    for (const [, client] of this.clients) {
      if (client.roomId === roomId) {
        this.send(client.ws, message);
      }
    }
  }

  private toGameStateDTO(room: Room, forPlayerId: string): GameStateDTO {
    const gameState = room.gameState!;
    const currentPlayerId = gameState.playerOrder[gameState.currentPlayerIndex];
    const player = room.players.get(forPlayerId);

    return {
      roomId: room.id,
      phase: gameState.phase,
      communityCards: gameState.communityCards,
      pot: gameState.pot,
      currentBet: gameState.currentBet,
      currentPlayerId,
      players: Array.from(room.players.values()).map((p) => this.toPlayerDTO(p)),
      myCards: player?.hand,
    };
  }

  private broadcastGameState(room: Room): void {
    let sentCount = 0;
    console.log(`[${new Date().toISOString()}] Broadcasting game state to room ${room.id}, total clients: ${this.clients.size}`);

    for (const [, client] of this.clients) {
      console.log(`  Client: playerId=${client.playerId}, roomId=${client.roomId}, match=${client.roomId === room.id}`);
      if (client.roomId === room.id && client.playerId) {
        const gameStateDTO = this.toGameStateDTO(room, client.playerId);
        this.send(client.ws, {
          type: 'game-started',
          payload: { gameState: gameStateDTO },
        });
        sentCount++;
      }
    }

    console.log(`[${new Date().toISOString()}] Sent game-started to ${sentCount} clients`);
  }
}
