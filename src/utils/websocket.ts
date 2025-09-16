import { io, Socket } from 'socket.io-client';
import { deviceStorage } from './deviceStorage';
import toast from 'react-hot-toast';

class WebSocketManager {
  private socket: Socket | null = null;
  private deviceId: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Function[]> = new Map();

  async connect(): Promise<void> {
    this.deviceId = await deviceStorage.getDeviceId();
    
    if (!this.deviceId) {
      console.warn('No device ID found, cannot connect to WebSocket');
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
    
    this.socket = io(wsUrl, {
      query: {
        deviceId: this.deviceId.toString(),
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.emit('disconnected', reason);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.handleReconnect();
    });

    // Playlist updates
    this.socket.on('playlist:updated', (data) => {
      console.log('Playlist updated:', data);
      this.emit('playlist:updated', data);
    });

    // Device status updates
    this.socket.on('device:blocked', (data) => {
      console.log('Device blocked:', data);
      this.emit('device:blocked', data);
      toast.error('Dispositivo foi bloqueado pelo administrador');
    });

    this.socket.on('device:unblocked', (data) => {
      console.log('Device unblocked:', data);
      this.emit('device:unblocked', data);
      toast.success('Dispositivo foi desbloqueado');
    });

    // Media prefetch notifications
    this.socket.on('media:prefetch', (data) => {
      console.log('Media prefetch requested:', data);
      this.emit('media:prefetch', data);
    });

    // Heartbeat
    this.socket.on('ping', () => {
      this.socket?.emit('pong');
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      toast.error('Conexão perdida. Recarregue a página.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  // Event emitter functionality
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  // Send events to server
  sendHeartbeat(data: any): void {
    if (this.socket?.connected) {
      this.socket.emit('device:heartbeat', {
        deviceId: this.deviceId,
        ...data,
      });
    }
  }

  sendPlaybackEvent(data: any): void {
    if (this.socket?.connected) {
      this.socket.emit('device:playback', {
        deviceId: this.deviceId,
        ...data,
      });
    }
  }

  sendError(error: any): void {
    if (this.socket?.connected) {
      this.socket.emit('device:error', {
        deviceId: this.deviceId,
        error: error.message || error,
        timestamp: new Date().toISOString(),
      });
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const wsManager = new WebSocketManager();

// Função de conveniência para conectar ao WebSocket
export const connectWebSocket = () => {
  wsManager.connect();
  return wsManager;
};