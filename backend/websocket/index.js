import { db } from '../config/database.js';

const deviceConnections = new Map();
const adminConnections = new Map();

const initializeWebSocket = (io) => {
  console.log('🔌 Inicializando WebSocket...');
  
  io.on('connection', (socket) => {
    console.log('Nova conexão WebSocket:', socket.id);

    // Eventos do dispositivo
    socket.on('device:register', async (data) => {
      try {
        await handleDeviceRegister(socket, data);
      } catch (error) {
        console.error('Erro ao registrar dispositivo:', error);
        socket.emit('error', { message: 'Erro ao registrar dispositivo' });
      }
    });

    // Eventos do admin
    socket.on('admin:register', async (data) => {
      try {
        await handleAdminRegister(socket, data);
      } catch (error) {
        console.error('Erro ao registrar admin:', error);
        socket.emit('error', { message: 'Erro ao registrar admin' });
      }
    });

    // Heartbeat
    socket.on('heartbeat', async (data) => {
      try {
        await handleHeartbeat(socket, data);
      } catch (error) {
        console.error('Erro no heartbeat:', error);
      }
    });

    // Log de reprodução
    socket.on('playback:log', async (data) => {
      try {
        await handlePlaybackLog(data);
      } catch (error) {
        console.error('Erro no log de reprodução:', error);
      }
    });

    // Status do dispositivo
    socket.on('device:status', async (data) => {
      try {
        await handleDeviceStatus(data);
        // Notificar admins sobre mudança de status
        adminConnections.forEach((adminSocket) => {
          adminSocket.emit('device:status:update', data);
        });
      } catch (error) {
        console.error('Erro no status do dispositivo:', error);
      }
    });

    // Comando para dispositivo
    socket.on('device:command', async (data) => {
      try {
        const deviceSocket = deviceConnections.get(data.deviceId);
        if (deviceSocket) {
          deviceSocket.emit('command', data.command);
          socket.emit('command:sent', { deviceId: data.deviceId, success: true });
        } else {
          socket.emit('command:sent', { deviceId: data.deviceId, success: false, error: 'Dispositivo não conectado' });
        }
      } catch (error) {
        console.error('Erro ao enviar comando:', error);
        socket.emit('error', { message: 'Erro ao enviar comando' });
      }
    });

    // Desconexão
    socket.on('disconnect', () => {
      console.log('Desconexão WebSocket:', socket.id);
      
      // Remover das conexões
      for (const [deviceId, deviceSocket] of deviceConnections.entries()) {
        if (deviceSocket.id === socket.id) {
          deviceConnections.delete(deviceId);
          console.log(`Dispositivo ${deviceId} desconectado`);
          
          // Notificar admins
          adminConnections.forEach((adminSocket) => {
            adminSocket.emit('device:disconnected', { deviceId });
          });
          break;
        }
      }
      
      for (const [adminId, adminSocket] of adminConnections.entries()) {
        if (adminSocket.id === socket.id) {
          adminConnections.delete(adminId);
          console.log(`Admin ${adminId} desconectado`);
          break;
        }
      }
    });
  });
};

// Função para registrar dispositivo
async function handleDeviceRegister(socket, data) {
  const { deviceId, deviceInfo } = data;
  
  console.log(`Registrando dispositivo: ${deviceId}`);
  
  // Armazenar conexão
  deviceConnections.set(deviceId, socket);
  
  // Atualizar no banco de dados
  try {
    const [devices] = await db.execute(
      'SELECT id FROM devices WHERE id = ?',
      [deviceId]
    );
    
    if (devices.length === 0) {
      // Criar novo dispositivo
      await db.execute(
        `INSERT INTO devices (id, name, status, last_seen, ip_address, device_info, tenant_id) 
         VALUES (?, ?, 'online', NOW(), ?, ?, 'default')`,
        [deviceId, deviceInfo?.name || `Device ${deviceId}`, socket.handshake.address, JSON.stringify(deviceInfo)]
      );
    } else {
      // Atualizar dispositivo existente
      await db.execute(
        'UPDATE devices SET status = "online", last_seen = NOW(), ip_address = ?, device_info = ? WHERE id = ?',
        [socket.handshake.address, JSON.stringify(deviceInfo), deviceId]
      );
    }
    
    socket.emit('device:registered', { success: true, deviceId });
    
    // Notificar admins
    adminConnections.forEach((adminSocket) => {
      adminSocket.emit('device:connected', { deviceId, deviceInfo });
    });
    
  } catch (error) {
    console.error('Erro ao registrar dispositivo no banco:', error);
    socket.emit('device:registered', { success: false, error: error.message });
  }
}

// Função para registrar admin
async function handleAdminRegister(socket, data) {
  const { adminId, tenantId } = data;
  
  console.log(`Registrando admin: ${adminId}`);
  
  // Armazenar conexão
  adminConnections.set(adminId, socket);
  
  socket.emit('admin:registered', { success: true, adminId });
  
  // Enviar lista de dispositivos conectados
  const connectedDevices = Array.from(deviceConnections.keys());
  socket.emit('devices:list', connectedDevices);
}

// Função para heartbeat
async function handleHeartbeat(socket, data) {
  const { deviceId } = data;
  
  try {
    // Atualizar last_seen no banco
    await db.execute(
      'UPDATE devices SET last_seen = NOW() WHERE id = ?',
      [deviceId]
    );
    
    socket.emit('heartbeat:ack', { timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Erro no heartbeat:', error);
  }
}

// Função para log de reprodução
async function handlePlaybackLog(data) {
  const { deviceId, contentId, event, timestamp } = data;
  
  try {
    // Salvar log no banco
    await db.execute(
      'INSERT INTO device_logs (device_id, event_type, message, data, created_at) VALUES (?, ?, ?, ?, ?)',
      [deviceId, 'playback', event, JSON.stringify(data), new Date(timestamp)]
    );
  } catch (error) {
    console.error('Erro ao salvar log de reprodução:', error);
  }
}

// Função para status do dispositivo
async function handleDeviceStatus(data) {
  const { deviceId, status, additionalInfo } = data;
  
  try {
    // Atualizar status no banco
    await db.execute(
      'UPDATE devices SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, deviceId]
    );
    
    // Log do evento
    await db.execute(
      'INSERT INTO device_logs (device_id, event_type, message, data) VALUES (?, ?, ?, ?)',
      [deviceId, 'status_change', `Status alterado para ${status}`, JSON.stringify(additionalInfo)]
    );
  } catch (error) {
    console.error('Erro ao atualizar status do dispositivo:', error);
  }
}

// Função para enviar comando para dispositivo específico
export function sendCommandToDevice(deviceId, command) {
  const deviceSocket = deviceConnections.get(deviceId);
  if (deviceSocket) {
    deviceSocket.emit('command', command);
    return true;
  }
  return false;
}

// Função para broadcast para todos os dispositivos
export function broadcastToDevices(event, data) {
  deviceConnections.forEach((socket) => {
    socket.emit(event, data);
  });
}

// Função para notificar admins
export function notifyAdmins(event, data) {
  adminConnections.forEach((socket) => {
    socket.emit(event, data);
  });
}

// Função para broadcast para dispositivos específicos
const broadcastToDevice = (deviceId, message) => {
  const deviceSocket = deviceConnections.get(deviceId);
  if (deviceSocket) {
    deviceSocket.emit('message', message);
    console.log(`Mensagem enviada para dispositivo ${deviceId}:`, message);
  } else {
    console.log(`Dispositivo ${deviceId} não encontrado ou desconectado`);
  }
};

// Função para broadcast para todos os admins
const broadcastToAdmins = (message) => {
  adminConnections.forEach((socket, adminId) => {
    socket.emit('message', message);
  });
  console.log('Mensagem enviada para todos os admins:', message);
};

export { initializeWebSocket, broadcastToDevice, broadcastToAdmins };

export default {
  initializeWebSocket,
  broadcastToDevice,
  broadcastToAdmins,
  sendCommandToDevice,
  broadcastToDevices,
  notifyAdmins
};