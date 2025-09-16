import React, { useEffect, useState } from 'react';
import DeviceOnboarding from '../components/DeviceOnboarding';
import MediaPlayer from '../components/MediaPlayer';
import { deviceStorage } from '../utils/deviceStorage';
import { wsManager } from '../utils/websocket';
import api from '../utils/api';

const DeviceApp: React.FC = () => {
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeDevice = async () => {
      try {
        // Check if device is already registered
        const storedDeviceId = await deviceStorage.getDeviceId();
        
        if (storedDeviceId) {
          // Validate device with server
          try {
            const response = await api.get(`/device/${storedDeviceId}/status`);
            
            if (response.data.status === 'blocked') {
              setIsBlocked(true);
            } else if (response.data.status === 'active') {
              setDeviceId(storedDeviceId);
              
              // Connect to WebSocket
              await wsManager.connect();
            } else {
              // Device not found or invalid, clear local storage
              await deviceStorage.clearDeviceId();
            }
          } catch (error: any) {
            if (error.response?.status === 404) {
              // Device not found, clear local storage
              await deviceStorage.clearDeviceId();
            } else if (error.response?.status === 403) {
              // Device blocked
              setIsBlocked(true);
              setDeviceId(storedDeviceId);
            } else {
              // Network error, try to use cached data
              setDeviceId(storedDeviceId);
              await wsManager.connect();
            }
          }
        }
      } catch (error) {
        console.error('Error initializing device:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDevice();

    // Setup WebSocket event handlers
    const handleDeviceBlocked = () => {
      setIsBlocked(true);
    };

    const handleDeviceUnblocked = () => {
      setIsBlocked(false);
    };

    wsManager.on('device:blocked', handleDeviceBlocked);
    wsManager.on('device:unblocked', handleDeviceUnblocked);

    return () => {
      wsManager.off('device:blocked', handleDeviceBlocked);
      wsManager.off('device:unblocked', handleDeviceUnblocked);
      wsManager.disconnect();
    };
  }, []);

  const handleOnboardingComplete = async (newDeviceId: number) => {
    setDeviceId(newDeviceId);
    await wsManager.connect();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Inicializando dispositivo...</p>
        </div>
      </div>
    );
  }

  if (!deviceId) {
    return <DeviceOnboarding onComplete={handleOnboardingComplete} />;
  }

  return <MediaPlayer deviceId={deviceId} isBlocked={isBlocked} />;
};

export default DeviceApp;