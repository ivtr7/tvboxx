import React, { useEffect, useRef, useState, useCallback } from 'react';
import { deviceStorage } from '../utils/deviceStorage';
import { wsManager } from '../utils/websocket';
import api from '../utils/api';
import toast from 'react-hot-toast';

interface PlaylistItem {
  id: number;
  type: 'video' | 'image';
  url: string;
  duration_seconds?: number;
  order: number;
  active: boolean;
  checksum?: string;
}

interface MediaPlayerProps {
  deviceId: number;
  isBlocked: boolean;
}

const MediaPlayer: React.FC<MediaPlayerProps> = ({ deviceId, isBlocked }) => {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Refs for double buffering
  const currentVideoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const currentImageRef = useRef<HTMLImageElement>(null);
  const nextImageRef = useRef<HTMLImageElement>(null);
  
  // State for media management
  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | null>(null);
  const [nextMediaUrl, setNextMediaUrl] = useState<string | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);

  // Load playlist from server or cache
  const loadPlaylist = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Try to load from server first
      if (isOnline) {
        const response = await api.get(`/content/public/content?deviceId=${deviceId}`);
        const serverPlaylist = response.data.data || [];
        
        // Transform content to playlist format
        const transformedPlaylist = serverPlaylist.map((item: any, index: number) => ({
          id: item.id,
          type: item.type === 'video' ? 'video' : 'image',
          url: item.url,
          duration_seconds: item.duration || (item.type === 'video' ? 30 : 10),
          order: index + 1,
          active: true,
          checksum: item.checksum
        }));
        
        // Save to local storage
        await deviceStorage.savePlaylist(transformedPlaylist);
        setPlaylist(transformedPlaylist);
        await deviceStorage.updateLastSync();
      } else {
        // Load from cache when offline
        const cachedPlaylist = await deviceStorage.getPlaylist();
        setPlaylist(cachedPlaylist);
      }
      
      setError(null);
    } catch (error: any) {
      console.error('Error loading playlist:', error);
      
      // Try to load from cache on error
      const cachedPlaylist = await deviceStorage.getPlaylist();
      if (cachedPlaylist.length > 0) {
        setPlaylist(cachedPlaylist);
        setError('Usando playlist em cache (offline)');
      } else {
        setError('Nenhum conteúdo disponível');
      }
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, isOnline]);

  // Preload media with caching
  const preloadMedia = useCallback(async (item: PlaylistItem): Promise<string> => {
    try {
      // Check if already cached
      const isCached = await deviceStorage.isCached(item.url, item.checksum);
      if (isCached) {
        const cachedBlob = await deviceStorage.getCachedMedia(item.url);
        if (cachedBlob) {
          return URL.createObjectURL(cachedBlob);
        }
      }

      // Download and cache
      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Cache the media
      if (item.checksum) {
        await deviceStorage.cacheMedia(item.url, blob, item.checksum);
      }

      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error preloading media:', error);
      // Return original URL as fallback
      return item.url;
    }
  }, []);

  // Load current and next media
  const loadCurrentMedia = useCallback(async () => {
    if (playlist.length === 0) return;

    const currentItem = playlist[currentIndex];
    if (!currentItem || !currentItem.active) {
      // Skip to next item
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
      return;
    }

    try {
      setIsPreloading(true);
      
      // Load current media
      const currentUrl = await preloadMedia(currentItem);
      setCurrentMediaUrl(currentUrl);

      // Preload next media
      const nextIndex = (currentIndex + 1) % playlist.length;
      const nextItem = playlist[nextIndex];
      if (nextItem && nextItem.active) {
        const nextUrl = await preloadMedia(nextItem);
        setNextMediaUrl(nextUrl);
      }

      // Send playback event
      wsManager.sendPlaybackEvent({
        itemId: currentItem.id,
        type: currentItem.type,
        action: 'started',
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Error loading media:', error);
      wsManager.sendError(error);
    } finally {
      setIsPreloading(false);
    }
  }, [playlist, currentIndex, preloadMedia]);

  // Handle media end/timeout
  const handleMediaEnd = useCallback(() => {
    const currentItem = playlist[currentIndex];
    if (currentItem) {
      wsManager.sendPlaybackEvent({
        itemId: currentItem.id,
        type: currentItem.type,
        action: 'ended',
        timestamp: new Date().toISOString(),
      });
    }

    // Move to next item
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
  }, [playlist, currentIndex]);

  // Setup video event handlers
  const setupVideoHandlers = useCallback((video: HTMLVideoElement) => {
    const handleEnded = () => handleMediaEnd();
    const handleError = (e: Event) => {
      console.error('Video error:', e);
      wsManager.sendError(new Error('Video playback error'));
      handleMediaEnd();
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [handleMediaEnd]);

  // Initialize
  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  // Load media when playlist or index changes
  useEffect(() => {
    if (playlist.length > 0) {
      loadCurrentMedia();
    }
  }, [playlist, currentIndex, loadCurrentMedia]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      loadPlaylist();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadPlaylist]);

  // WebSocket event handlers
  useEffect(() => {
    const handlePlaylistUpdate = () => {
      console.log('Playlist updated, reloading...');
      loadPlaylist();
    };

    wsManager.on('playlist:updated', handlePlaylistUpdate);

    return () => {
      wsManager.off('playlist:updated', handlePlaylistUpdate);
    };
  }, [loadPlaylist]);

  // Image timer for duration
  useEffect(() => {
    const currentItem = playlist[currentIndex];
    if (currentItem?.type === 'image' && currentItem.duration_seconds) {
      const timer = setTimeout(() => {
        handleMediaEnd();
      }, currentItem.duration_seconds * 1000);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, playlist, handleMediaEnd]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (currentMediaUrl && currentMediaUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentMediaUrl);
      }
      if (nextMediaUrl && nextMediaUrl.startsWith('blob:')) {
        URL.revokeObjectURL(nextMediaUrl);
      }
    };
  }, [currentMediaUrl, nextMediaUrl]);

  // Send heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      wsManager.sendHeartbeat({
        currentItem: playlist[currentIndex]?.id || null,
        playlistVersion: playlist.length,
        isOnline,
        cacheSize: 0, // Will be calculated async
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [playlist, currentIndex, isOnline]);

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-red-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-24 h-24 bg-red-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">Dispositivo Bloqueado</h1>
          <p className="text-xl mb-2">Este dispositivo foi bloqueado pelo administrador</p>
          <p className="text-red-300">Entre em contato com o suporte para mais informações</p>
          <div className="mt-8 text-sm text-red-400">
            Device ID: {deviceId}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Carregando playlist...</p>
        </div>
      </div>
    );
  }

  if (error && playlist.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4">Nenhum Conteúdo Disponível</h1>
          <p className="text-gray-400 mb-2">{error}</p>
          <button
            onClick={loadPlaylist}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const currentItem = playlist[currentIndex];
  if (!currentItem || !currentMediaUrl) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-pulse w-24 h-24 bg-gray-800 rounded-full mx-auto mb-4"></div>
          <p className="text-xl">Preparando conteúdo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Connection status indicator */}
      {!isOnline && (
        <div className="absolute top-4 right-4 z-50 bg-yellow-600 text-white px-3 py-1 rounded-full text-sm">
          Offline
        </div>
      )}

      {/* Loading indicator */}
      {isPreloading && (
        <div className="absolute top-4 left-4 z-50 bg-blue-600 text-white px-3 py-1 rounded-full text-sm flex items-center">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-2"></div>
          Carregando...
        </div>
      )}

      {/* Media display */}
      <div className="w-full h-screen flex items-center justify-center">
        {currentItem.type === 'video' ? (
          <video
            ref={currentVideoRef}
            src={currentMediaUrl}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            onLoadedData={() => {
              if (currentVideoRef.current) {
                setupVideoHandlers(currentVideoRef.current);
              }
            }}
          />
        ) : (
          <img
            ref={currentImageRef}
            src={currentMediaUrl}
            alt="Content"
            className="w-full h-full object-cover"
            onError={() => {
              console.error('Image load error');
              handleMediaEnd();
            }}
          />
        )}
      </div>

      {/* Hidden preload elements */}
      {nextMediaUrl && (
        <div className="hidden">
          {playlist[(currentIndex + 1) % playlist.length]?.type === 'video' ? (
            <video
              ref={nextVideoRef}
              src={nextMediaUrl}
              preload="metadata"
              muted
            />
          ) : (
            <img
              ref={nextImageRef}
              src={nextMediaUrl}
              alt="Next content"
            />
          )}
        </div>
      )}

      {/* Debug info (hidden by default, show with Ctrl+Shift+D) */}
      <div className="absolute bottom-4 left-4 text-white text-xs opacity-0 hover:opacity-100 transition-opacity">
        <div>Device: {deviceId}</div>
        <div>Item: {currentIndex + 1}/{playlist.length}</div>
        <div>Type: {currentItem.type}</div>
        <div>Status: {isOnline ? 'Online' : 'Offline'}</div>
      </div>
    </div>
  );
};

export default MediaPlayer;