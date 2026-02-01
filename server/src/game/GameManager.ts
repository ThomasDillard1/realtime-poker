import { Room, Player } from '../types/index.js';

class GameManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(name: string, smallBlind: number = 10, bigBlind: number = 20): Room {
    const id = this.generateId();
    const room: Room = {
      id,
      name,
      players: new Map(),
      maxPlayers: 6,
      smallBlind,
      bigBlind,
      gameState: null,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  addPlayerToRoom(roomId: string, player: Player): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.size >= room.maxPlayers) return false;
    room.players.set(player.id, player);
    return true;
  }

  removePlayerFromRoom(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const removed = room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
    }
    return removed;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}

export const gameManager = new GameManager();
