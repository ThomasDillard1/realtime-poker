import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage, Player, PlayerDTO, RoomDTO, GameStateDTO, Room, PlayerAction, ShowdownPlayerDTO, HandCompletePayload, ActionType } from '../types/index.js';
import { gameManager } from '../game/GameManager.js';
import { startGame, getValidActions, processAction, getActivePlayers, determineWinners, startNextHand } from '../game/GameEngine.js';

interface ClientConnection {
  ws: WebSocket;
  playerId: string | null;
  roomId: string | null;
}

const ACTION_TIMER_SECONDS = 30;

export class WebSocketHandler {
  private wss: WSServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private actionTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> timer

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
      case 'start-next-hand':
        this.handleStartNextHand(ws, message.payload);
        break;
      case 'player-action':
        this.handlePlayerAction(ws, message.payload);
        break;
      case 'get-rooms':
        this.handleGetRooms(ws);
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

    // Broadcast updated room list to lobby clients
    this.broadcastRoomsList();
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

    // Broadcast updated room list to lobby clients
    this.broadcastRoomsList();
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

    // Broadcast updated room list to lobby clients
    this.broadcastRoomsList();
  }

  private handleGetRooms(ws: WebSocket): void {
    const rooms = gameManager.getAllRooms();
    const roomDTOs = rooms.map(room => this.toRoomDTO(room));
    this.send(ws, {
      type: 'rooms-list',
      payload: { rooms: roomDTOs },
    });
  }

  private broadcastRoomsList(): void {
    const rooms = gameManager.getAllRooms();
    const roomDTOs = rooms.map(room => this.toRoomDTO(room));
    // Broadcast to all clients not currently in a room
    for (const [, client] of this.clients) {
      if (!client.roomId) {
        this.send(client.ws, {
          type: 'rooms-list',
          payload: { rooms: roomDTOs },
        });
      }
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

    // Send action-required to current player with timer
    this.sendActionRequired(room);

    // Broadcast updated room list (room is now in progress)
    this.broadcastRoomsList();

    console.log(`[${new Date().toISOString()}] Game started in room ${room.id}`);
  }

  private handleStartNextHand(ws: WebSocket, payload: { roomId: string }): void {
    const room = gameManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(ws, 'Room not found');
      return;
    }

    if (room.gameState) {
      this.sendError(ws, 'Hand already in progress');
      return;
    }

    // Get eligible players (those with chips)
    const eligiblePlayers = Array.from(room.players.values()).filter(p => p.chips > 0);

    if (eligiblePlayers.length < 2) {
      this.sendError(ws, 'Not enough players with chips to continue');
      return;
    }

    // Find previous dealer index (or default to 0)
    const previousDealerIndex = Array.from(room.players.values()).findIndex(p => p.isDealer);
    const dealerIndex = previousDealerIndex >= 0 ? previousDealerIndex : 0;

    // Start next hand with dealer rotation
    const gameState = startNextHand(room, dealerIndex);
    if (!gameState) {
      this.sendError(ws, 'Failed to start next hand');
      return;
    }

    room.gameState = gameState;

    // Send personalized game state to each player
    this.broadcastGameState(room);

    // Send action-required to current player with timer
    this.sendActionRequired(room);

    console.log(`[${new Date().toISOString()}] Next hand started in room ${room.id}, hand #${gameState.handNumber}`);
  }

  private autoStartNextHand(roomId: string, previousDealerIndex: number): void {
    const room = gameManager.getRoom(roomId);
    if (!room) {
      console.log(`[${new Date().toISOString()}] Room ${roomId} no longer exists, skipping auto-start`);
      return;
    }

    // Don't start if a game is already in progress
    if (room.gameState) {
      console.log(`[${new Date().toISOString()}] Game already in progress in room ${roomId}, skipping auto-start`);
      return;
    }

    // Get eligible players (those with chips)
    const eligiblePlayers = Array.from(room.players.values()).filter(p => p.chips > 0);

    if (eligiblePlayers.length < 2) {
      // Game over - we have a winner!
      if (eligiblePlayers.length === 1) {
        const winner = eligiblePlayers[0];
        winner.status = 'active'; // Mark winner as active for display

        // Mark all other players as out
        for (const player of room.players.values()) {
          if (player.id !== winner.id) {
            player.status = 'out';
          }
        }

        // Sort players by chips for final standings
        const allPlayers = Array.from(room.players.values())
          .sort((a, b) => b.chips - a.chips);

        this.broadcastToRoom(roomId, {
          type: 'game-over',
          payload: {
            winner: this.toPlayerDTO(winner),
            players: allPlayers.map(p => this.toPlayerDTO(p)),
          },
        });

        // Clear game state
        room.gameState = null;

        // Update room list for lobby
        this.broadcastRoomsList();

        console.log(`[${new Date().toISOString()}] Game over in room ${roomId}! Winner: ${winner.name}`);
      } else {
        // No players left (shouldn't happen normally)
        this.broadcastToRoom(roomId, {
          type: 'error',
          payload: { message: 'Game over - no players remaining' },
        });
        console.log(`[${new Date().toISOString()}] No players remaining in room ${roomId}`);
      }
      return;
    }

    // Start next hand with dealer rotation
    const gameState = startNextHand(room, previousDealerIndex);
    if (!gameState) {
      console.log(`[${new Date().toISOString()}] Failed to start next hand in room ${roomId}`);
      return;
    }

    room.gameState = gameState;

    // Send personalized game state to each player
    this.broadcastGameState(room);

    // Send action-required to current player with timer
    this.sendActionRequired(room);

    console.log(`[${new Date().toISOString()}] Auto-started hand #${gameState.handNumber} in room ${roomId}`);
  }

  private handlePlayerAction(ws: WebSocket, payload: { roomId: string; playerId: string; action: PlayerAction }): void {
    const room = gameManager.getRoom(payload.roomId);
    if (!room || !room.gameState) {
      this.sendError(ws, 'Game not found');
      return;
    }

    // Clear the action timer since player acted
    this.clearActionTimer(room.id);

    const result = processAction(
      room.gameState,
      room.players,
      payload.action.playerId,
      payload.action.action,
      payload.action.amount
    );

    if (!result.success) {
      this.sendError(ws, result.error || 'Action failed');
      return;
    }

    // Broadcast updated game state to all players
    this.broadcastGameUpdate(room);

    if (result.handComplete) {
      this.handleHandComplete(room);
    } else {
      // Send action-required to next player with timer
      this.sendActionRequired(room);
    }
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

  private toShowdownPlayerDTO(player: Player, revealCards: boolean): ShowdownPlayerDTO {
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
      // Reveal cards only at showdown for active/all-in players
      hand: revealCards && (player.status === 'active' || player.status === 'all-in')
        ? player.hand
        : [],
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
      minRaise: gameState.minRaise,
      bigBlind: gameState.bigBlind,
      currentPlayerId,
      players: Array.from(room.players.values()).map((p) => this.toPlayerDTO(p)),
      myCards: player?.hand,
    };
  }

  private broadcastGameState(room: Room): void {
    for (const [, client] of this.clients) {
      if (client.roomId === room.id && client.playerId) {
        const gameStateDTO = this.toGameStateDTO(room, client.playerId);
        this.send(client.ws, {
          type: 'game-started',
          payload: { gameState: gameStateDTO },
        });
      }
    }
  }

  private broadcastGameUpdate(room: Room): void {
    for (const [, client] of this.clients) {
      if (client.roomId === room.id && client.playerId) {
        const gameStateDTO = this.toGameStateDTO(room, client.playerId);
        this.send(client.ws, {
          type: 'game-updated',
          payload: { gameState: gameStateDTO },
        });
      }
    }
  }

  private startActionTimer(roomId: string, playerId: string, validActions: ActionType[]): number {
    // Clear any existing timer for this room
    this.clearActionTimer(roomId);

    const deadline = Date.now() + (ACTION_TIMER_SECONDS * 1000);

    const timer = setTimeout(() => {
      this.handleActionTimeout(roomId, playerId, validActions);
    }, ACTION_TIMER_SECONDS * 1000);

    this.actionTimers.set(roomId, timer);
    return deadline;
  }

  private clearActionTimer(roomId: string): void {
    const timer = this.actionTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.actionTimers.delete(roomId);
    }
  }

  private handleActionTimeout(roomId: string, playerId: string, validActions: ActionType[]): void {
    const room = gameManager.getRoom(roomId);
    if (!room || !room.gameState) {
      return;
    }

    // Verify it's still this player's turn
    const currentPlayerId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
    if (currentPlayerId !== playerId) {
      return;
    }

    // Auto-act: check if valid, otherwise fold
    const autoAction: ActionType = validActions.includes('check') ? 'check' : 'fold';

    console.log(`[${new Date().toISOString()}] Action timeout for ${playerId} in room ${roomId}, auto-${autoAction}`);

    // Process the auto-action
    const result = processAction(
      room.gameState,
      room.players,
      playerId,
      autoAction,
      undefined
    );

    if (!result.success) {
      console.error(`[${new Date().toISOString()}] Auto-action failed: ${result.error}`);
      return;
    }

    // Broadcast updated game state
    this.broadcastGameUpdate(room);

    if (result.handComplete) {
      this.handleHandComplete(room);
    } else {
      // Send action-required to next player
      this.sendActionRequired(room);
    }
  }

  private sendActionRequired(room: Room): void {
    if (!room.gameState) return;

    const currentPlayerId = room.gameState.playerOrder[room.gameState.currentPlayerIndex];
    const currentPlayer = room.players.get(currentPlayerId)!;
    const validActions = getValidActions(room.gameState, currentPlayer);

    // Start timer and get deadline
    const turnDeadline = this.startActionTimer(room.id, currentPlayerId, validActions);

    this.broadcastToRoom(room.id, {
      type: 'action-required',
      payload: { playerId: currentPlayerId, validActions, turnDeadline },
    });
  }

  private handleHandComplete(room: Room): void {
    if (!room.gameState) return;

    // Clear action timer
    this.clearActionTimer(room.id);

    const activePlayers = getActivePlayers(room.gameState, room.players);
    const isShowdown = activePlayers.length > 1;
    let winners;

    if (!isShowdown) {
      const winner = activePlayers[0];
      winners = [{
        playerId: winner.id,
        amount: room.gameState.pot,
        handResult: { playerId: winner.id, rank: 'high-card' as const, cards: [], score: 0 },
      }];
    } else {
      winners = determineWinners(room.gameState, room.players);
    }

    // Award chips to winners
    for (const winner of winners) {
      const player = room.players.get(winner.playerId);
      if (player) {
        player.chips += winner.amount;
      }
    }

    const handCompletePayload: HandCompletePayload = {
      winners,
      players: Array.from(room.players.values()).map((p) => this.toShowdownPlayerDTO(p, isShowdown)),
      communityCards: room.gameState.communityCards,
      pot: room.gameState.pot,
      isShowdown,
    };

    const previousDealerIndex = room.gameState.dealerIndex;

    this.broadcastToRoom(room.id, {
      type: 'hand-complete',
      payload: handCompletePayload,
    });

    room.gameState = null;

    const roomId = room.id;
    setTimeout(() => {
      this.autoStartNextHand(roomId, previousDealerIndex);
    }, 6000);
  }
}
