import { db } from '../config/database.js';

const deviceConnections = new Map();
const adminConnections = new Map();

export const setupSocketIO = (io) => {
  io.on('connection', (socket) => {
    console.log('New Socket.IO connection:', socket.id);

    // Handle device registration
    socket.on('device:register', async (data) => {
      try {
        const { deviceId } = data;
        
        if (!deviceId) {
          socket.emit('error', { message: 'Device ID required' });
          return;
        }

        // Verify device exists and is active
        const [devices] = await db.execute(
          'SELECT * FROM devices WHERE device_id = ?',
          [deviceId]
        );

        if (devices.length === 0) {
          socket.emit('error', { message: 'Device not found' });
          return;
        }

        const device = devices[0];
        
        if (device.status === 'blocked') {
          socket.emit('device:blocked', { deviceId });
          return;
        }

        // Register device connection
        deviceConnections.set(deviceId, {
          socket,
          deviceId,
          lastSeen: new Date(),
          device
        });

        // Update device last seen
        await db.execute(
          'UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?',
          [deviceId]
        );

        socket.join(`device:${deviceId}`);
        socket.emit('device:registered', { deviceId });

        console.log(`Device ${deviceId} registered`);

        // Notify admins
        io.to('admin').emit('device:online', {
          deviceId,
          name: device.name
        });

      } catch (error) {
        console.error('Device register error:', error);
        socket.emit('error', { message: 'Registration failed' });
      }
    });

    // Handle admin registration
    socket.on('admin:register', () => {
      adminConnections.set(socket.id, {
        socket,
        registeredAt: new Date()
      });

      socket.join('admin');
      socket.emit('admin:registered');
      console.log('Admin registered:', socket.id);
    });

    // Handle device heartbeat
    socket.on('device:heartbeat', async (data) => {
      try {
        const { deviceId, currentItem, playlistVersion, isOnline, cacheSize } = data;

        if (deviceConnections.has(deviceId)) {
          const connection = deviceConnections.get(deviceId);
          connection.lastSeen = new Date();

          // Log heartbeat
          await db.execute(
            'INSERT INTO device_logs (device_id, event_type, data) VALUES (?, ?, ?)',
            [deviceId, 'heartbeat', JSON.stringify({
              currentItem,
              playlistVersion,
              isOnline,
              cacheSize,
              timestamp: new Date().toISOString()
            })]
          );

          // Update device last seen
          await db.execute(
            'UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?',
            [deviceId]
          );
        }
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    });

    // Handle playback events
    socket.on('device:playback', async (data) => {
      try {
        const { deviceId, itemId, type, action, timestamp } = data;

        // Log playback event
        await db.execute(
          'INSERT INTO device_logs (device_id, event_type, data) VALUES (?, ?, ?)',
          [deviceId, 'playback', JSON.stringify({
            itemId,
            type,
            action,
            timestamp
          })]
        );

        // Notify admins
        io.to('admin').emit('device:playback', data);

      } catch (error) {
        console.error('Playback log error:', error);
      }
    });

    // Handle device errors
    socket.on('device:error', async (data) => {
      try {
        const { deviceId, error, timestamp } = data;

        // Log error
        await db.execute(
          'INSERT INTO device_logs (device_id, event_type, data) VALUES (?, ?, ?)',
          [deviceId, 'error', JSON.stringify({
            error,
            timestamp
          })]
        );

        // Notify admins
        io.to('admin').emit('device:error', data);

      } catch (error) {
        console.error('Error log error:', error);
      }
    });

    // Handle admin commands
    socket.on('admin:block_device', async (data) => {
      try {
        const { deviceId } = data;

        // Update device status
        await db.execute(
          'UPDATE devices SET status = ? WHERE device_id = ?',
          ['blocked', deviceId]
        );

        // Notify device
        io.to(`device:${deviceId}`).emit('device:blocked', { deviceId });

        // Notify other admins
        socket.to('admin').emit('device:blocked', { deviceId });

        console.log(`Device ${deviceId} blocked`);

      } catch (error) {
        console.error('Block device error:', error);
      }
    });

    socket.on('admin:unblock_device', async (data) => {
      try {
        const { deviceId } = data;

        // Update device status
        await db.execute(
          'UPDATE devices SET status = ? WHERE device_id = ?',
          ['active', deviceId]
        );

        // Notify device
        io.to(`device:${deviceId}`).emit('device:unblocked', { deviceId });

        // Notify other admins
        socket.to('admin').emit('device:unblocked', { deviceId });

        console.log(`Device ${deviceId} unblocked`);

      } catch (error) {
        console.error('Unblock device error:', error);
      }
    });

    // Handle playlist updates
    socket.on('admin:update_playlist', async (data) => {
      try {
        const { deviceId } = data;

        // Notify device about playlist update
        io.to(`device:${deviceId}`).emit('playlist:updated', {
          deviceId,
          timestamp: new Date().toISOString()
        });

        console.log(`Playlist updated for device ${deviceId}`);

      } catch (error) {
        console.error('Update playlist error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', socket.id, reason);

      // Remove from device connections
      for (const [deviceId, connection] of deviceConnections) {
        if (connection.socket.id === socket.id) {
          deviceConnections.delete(deviceId);
          
          // Notify admins
          io.to('admin').emit('device:offline', { deviceId });
          break;
        }
      }

      // Remove from admin connections
      adminConnections.delete(socket.id);
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Cleanup offline devices periodically
  setInterval(async () => {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [deviceId, connection] of deviceConnections) {
      if (now - connection.lastSeen > timeout) {
        console.log(`Device ${deviceId} timed out`);
        
        deviceConnections.delete(deviceId);
        
        // Notify admins
        io.to('admin').emit('device:offline', { deviceId });
      }
    }
  }, 60000); // Check every minute
};

// Export functions for use in routes
export const broadcastToDevice = (deviceId, message) => {
  const connection = deviceConnections.get(deviceId);
  if (connection && connection.socket.connected) {
    connection.socket.emit(message.type, message.data);
    return true;
  }
  return false;
};

export const broadcastToAdmins = (message) => {
  adminConnections.forEach(connection => {
    if (connection.socket.connected) {
      connection.socket.emit(message.type, message.data);
    }
  });
};

export const getConnectedDevices = () => {
  return Array.from(deviceConnections.keys());
};

export const getDeviceConnection = (deviceId) => {
  return deviceConnections.get(deviceId);
};