import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { Wifi, WifiOff, Clock, Volume2, ChevronLeft, ChevronRight } from 'lucide-react';
import { detectVideoCapabilities, getSupportedFormats, generateVideoFallbacks, generateAdvancedVideoFallbacks, getBestVideoFormat, testVideoFormat, VideoFallback } from '../../utils/videoCompatibility';
import { videoCache } from '../../utils/videoCache';

interface ContentItem {
  id: string;
  nome: string;
  descricao: string;
  categoria: string;
  preco: number;
  created_at: string;
  file_path?: string;
  type?: string;
  duracao?: number;
  formats?: VideoFormat[];
}

interface VideoFormat {
  quality: string;
  format: string;
  url: string;
  size: number;
}

interface VideoCapabilities {
  supportedFormats: string[];
  hardwareAcceleration: boolean;
  maxResolution: string;
  preferredCodecs: string[];
}

const TVBoxDisplay: React.FC = () => {
  const { deviceId } = useParams();
  // Display data will be fetched from backend API
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<'landscape' | 'portrait' | 'square'>('landscape');
  const [videoCapabilities, setVideoCapabilities] = useState<VideoCapabilities | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const [preloadedVideos, setPreloadedVideos] = useState<Set<string>>(new Set());
  const [networkQuality, setNetworkQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [adaptiveQuality, setAdaptiveQuality] = useState<string>('720p');
  const networkMonitorRef = useRef<NodeJS.Timeout | null>(null);

  // Network quality monitoring for adaptive streaming
  const monitorNetworkQuality = useCallback(() => {
    if (!('connection' in navigator)) {
      // Fallback for browsers without Network Information API
      return;
    }
    
    const connection = (navigator as any).connection;
    const effectiveType = connection?.effectiveType;
    const downlink = connection?.downlink || 1;
    
    // Determine network quality based on connection info
    if (effectiveType === '4g' && downlink > 5) {
      setNetworkQuality('high');
      setAdaptiveQuality('1080p');
    } else if (effectiveType === '4g' || (effectiveType === '3g' && downlink > 2)) {
      setNetworkQuality('medium');
      setAdaptiveQuality('720p');
    } else {
      setNetworkQuality('low');
      setAdaptiveQuality('480p');
    }
  }, []);

  // Get device ID from localStorage
  const deviceId = localStorage.getItem('tvbox_device_id');
  const deviceName = localStorage.getItem('tvbox_device_name');

  // Fetch content to display - specific to this device
  const { data: content, isLoading, refetch } = useQuery({
    queryKey: ['tvbox-content', deviceId],
    queryFn: async () => {
      if (!deviceId) {
        // If no device ID, redirect to setup
        window.location.href = '/tvbox/setup';
        return [];
      }
      
      try {
        // First try to get device-specific playlist
        const playlistResponse = await api.get(`/devices/${deviceId}/playlist`);
        if (playlistResponse.data.success && playlistResponse.data.items.length > 0) {
          return playlistResponse.data.items.map((item: any) => ({
            id: item.id,
            nome: item.filename || `Content ${item.id}`,
            tipo: item.type,
            file_path: item.url,
            duracao: item.duration_seconds || 30,
            ativo: item.active
          }));
        }
        
        // Fallback to general content if no specific playlist
        const response = await api.get('/public/content');
        return response.data as ContentItem[];
      } catch (error) {
        console.error('Error fetching device content:', error);
        // Fallback to general content on error
        const response = await api.get('/public/content');
        return response.data as ContentItem[];
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!deviceId, // Only run query if device ID exists
  });

  // Initialize video capabilities and network monitoring on component mount
  useEffect(() => {
    const initializeVideoCapabilities = async () => {
      try {
        const capabilities = await detectVideoCapabilities();
        setVideoCapabilities(capabilities);
        console.log('Video capabilities detected:', capabilities);
      } catch (error) {
        console.error('Failed to detect video capabilities:', error);
      }
    };

    initializeVideoCapabilities();
    monitorNetworkQuality();
    
    // Set up periodic network monitoring
    networkMonitorRef.current = setInterval(monitorNetworkQuality, 30000); // Check every 30 seconds
    
    return () => {
      if (networkMonitorRef.current) {
        clearInterval(networkMonitorRef.current);
      }
    };
  }, [monitorNetworkQuality]);

  // Helper function to get optimal video URL with advanced fallbacks
  const getOptimalVideoUrl = async (content: ContentItem): Promise<string | null> => {
    try {
      // Check cache first
      const cachedVideo = await videoCache.getVideo(content.id);
      if (cachedVideo) {
        console.log('Using cached video for:', content.id);
        return cachedVideo.url;
      }
      
      if (!videoCapabilities) return null;
      
      // Generate original URL
      const originalUrl = content.file_path 
        ? `http://172.16.88.14:3001/${content.file_path.split('\\').join('/')}`
        : null;
        
      if (!originalUrl) return null;
      
      // Generate advanced fallbacks with multiple formats and qualities
      const fallbacks = generateAdvancedVideoFallbacks(originalUrl, videoCapabilities);
      
      // Test and get the best working format
      const bestFormat = await getBestVideoFormat(fallbacks);
      
      if (bestFormat) {
        // Cache the working URL for future use
        await videoCache.cacheVideo(content.id, bestFormat.url, {
          title: content.nome || 'Video',
          duration: content.duracao || 0,
          size: 0,
          format: bestFormat.format,
          quality: bestFormat.quality
        });
        
        return bestFormat.url;
      }
      
      return originalUrl; // Fallback to original
    } catch (error) {
      console.error('Error getting optimal video URL:', error);
      return content.file_path 
        ? `http://172.16.88.14:3001/${content.file_path.split('\\').join('/')}`
        : null;
    }
  };

  // Helper function to extract video format from URL
  const getVideoFormat = (url: string): string => {
    const extension = url.split('.').pop()?.toLowerCase();
    return extension || 'mp4';
  };

  // Adaptive quality selection based on network and device capabilities
  const getAdaptiveVideoUrl = useCallback(async (contentItem: ContentItem): Promise<string | null> => {
    try {
      // Check if we have processed versions available
      const response = await fetch(`http://172.16.88.14:3001/api/v1/video-processing/info/${contentItem.id}`);
      if (response.ok) {
        const videoInfo = await response.json();
        
        // Select quality based on network and capabilities
        const preferredQualities = networkQuality === 'high' 
          ? ['1080p', '720p', '480p']
          : networkQuality === 'medium'
          ? ['720p', '480p', '360p']
          : ['480p', '360p', '240p'];
          
        for (const quality of preferredQualities) {
          if (videoInfo.formats?.[quality]) {
            return videoInfo.formats[quality].url;
          }
        }
      }
      
      // Fallback to original file
      return contentItem.file_path 
        ? `http://172.16.88.14:3001/${contentItem.file_path.split('\\').join('/')}`
        : null;
    } catch (error) {
      console.warn('Failed to get adaptive video URL:', error);
      return contentItem.file_path 
        ? `http://172.16.88.14:3001/${contentItem.file_path.split('\\').join('/')}`
        : null;
    }
  }, [networkQuality]);

  // Enhanced video loading with cache and fallbacks
  const loadVideoWithFallbacks = async (content: ContentItem): Promise<void> => {
    setIsLoadingVideo(true);
    setVideoError(null);
    setCachedVideoUrl(null);

    try {
      // First try adaptive URL based on network quality
      let optimalUrl = await getAdaptiveVideoUrl(content);
      
      // If adaptive fails, try cached version
      if (!optimalUrl) {
        optimalUrl = await getOptimalVideoUrl(content);
      }
      
      if (optimalUrl) {
        setCachedVideoUrl(optimalUrl);
        
        // Update video element ref
        if (videoElementRef.current) {
          videoElementRef.current.src = optimalUrl;
          
          // Monitor video loading performance for future adaptations
          const startTime = Date.now();
          videoElementRef.current.addEventListener('canplay', () => {
            const loadTime = Date.now() - startTime;
            // Adjust quality if loading is too slow (>3 seconds)
            if (loadTime > 3000 && networkQuality !== 'low') {
              setNetworkQuality(networkQuality === 'high' ? 'medium' : 'low');
            }
          }, { once: true });
        }
      } else {
        throw new Error('No suitable video format found');
      }
    } catch (error) {
      console.error('Failed to load video:', error);
      setVideoError('Erro ao carregar vídeo');
    } finally {
      setIsLoadingVideo(false);
    }
  };

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Preload next videos for smooth playback with progressive loading
  useEffect(() => {
    if (!content || !videoCapabilities) return;

    const preloadNextVideos = async () => {
      // Preload next 2 videos for better UX
      for (let i = 1; i <= 2; i++) {
        const nextIndex = (currentIndex + i) % content.length;
        const nextContent = content[nextIndex];
        
        if ((nextContent.categoria === 'video' || nextContent.type === 'video') && 
            !preloadedVideos.has(nextContent.id)) {
          try {
            const videoUrl = await getOptimalVideoUrl(nextContent);
            if (videoUrl) {
              // Progressive caching - cache metadata first, then video data
              await videoCache.cacheVideo(nextContent.id, videoUrl, {
                title: nextContent.nome,
                duration: nextContent.duracao || 0,
                format: getVideoFormat(videoUrl),
                quality: 'auto',
                preloaded: true
              });
              setPreloadedVideos(prev => new Set([...prev, nextContent.id]));
              
              // Create invisible video element for progressive loading
              const preloadVideo = document.createElement('video');
              preloadVideo.preload = 'metadata';
              preloadVideo.src = videoUrl;
              preloadVideo.muted = true;
              
              // Clean up after metadata is loaded
              preloadVideo.addEventListener('loadedmetadata', () => {
                preloadVideo.remove();
              });
              
              preloadVideo.addEventListener('error', () => {
                preloadVideo.remove();
              });
            }
          } catch (error) {
            console.error('Failed to preload video:', error);
          }
        }
      }
    };

    // Stagger preloading to avoid network congestion
    const timer = setTimeout(preloadNextVideos, 1500);
    return () => clearTimeout(timer);
  }, [currentIndex, content, videoCapabilities, preloadedVideos]);

  // Auto-advance content based on type
  useEffect(() => {
    if (!content || content.length === 0) return;
    
    const currentContent = content[currentIndex];
    let timer: NodeJS.Timeout;
    
    // Reset video states when content changes
    setIsVideoPlaying(false);
    setShowPlayButton(false);
    setAutoplayFailed(false);

    // For videos, don't auto-advance - let video end event handle it
    if (currentContent?.categoria === 'video' || currentContent?.type === 'video') {
      // Video will handle its own timing
      return;
    } else {
      // For images, use custom duration or default to 10 seconds
      const duration = (currentContent?.duracao || 10) * 1000; // Convert to milliseconds
      timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % content.length);
      }, duration);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [content, currentIndex]);

  // Listen for real-time updates via WebSocket
  useEffect(() => {
    const ws = new WebSocket('ws://172.16.88.14:3001');
    
    ws.onopen = () => {
      // Register as device to receive content updates
      ws.send(JSON.stringify({
        type: 'DEVICE_REGISTER',
        deviceId: deviceId || 'tvbox-display'
      }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'CONTENT_UPDATED') {
        console.log('Content updated:', data);
        // Refetch content when changes occur
        refetch();
      }
    };

    return () => {
      ws.close();
    };
  }, [deviceId, refetch]);

  // Check connection status
  useEffect(() => {
    const checkConnection = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);

    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, []);

  // Handle manual play button click
  const handlePlayClick = () => {
    if (videoRef) {
      videoRef.play().then(() => {
        setIsVideoPlaying(true);
        setShowPlayButton(false);
        setAutoplayFailed(false);
      }).catch(console.error);
    }
  };

  // Navigation functions
  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % content.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + content.length) % content.length);
  };

  // Handle user interaction to enable video playback on mobile
  useEffect(() => {
    const handleUserInteraction = () => {
      if (videoRef && videoRef.paused && autoplayFailed) {
        videoRef.play().then(() => {
          setIsVideoPlaying(true);
          setShowPlayButton(false);
          setAutoplayFailed(false);
        }).catch(console.error);
      }
    };

    // Add listeners for user interaction only if autoplay failed
    if (autoplayFailed) {
      document.addEventListener('touchstart', handleUserInteraction, { once: true });
      document.addEventListener('click', handleUserInteraction, { once: true });
    }

    return () => {
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, [videoRef, autoplayFailed]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-2xl">Carregando conteúdo...</div>
      </div>
    );
  }

  if (!content || content.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-4xl font-bold mb-4">ORI.CONTROL</h1>
          <p className="text-xl">Nenhum conteúdo disponível</p>
          <p className="text-sm mt-2 opacity-75">Aguardando configuração...</p>
        </div>
      </div>
    );
  }

  const currentContent = content[currentIndex];

  // Determine layout based on media aspect ratio
  const isPortraitContent = mediaAspectRatio === 'portrait';
  const containerClass = isPortraitContent 
    ? "min-h-screen bg-black text-white flex flex-col items-center justify-center" 
    : "min-h-screen bg-black text-white flex items-center justify-center";
  
  const mediaContainerClass = isPortraitContent
    ? "flex flex-col items-center justify-center w-full h-full max-w-md mx-auto"
    : "flex items-center justify-center gap-4 w-full h-full";

  const playerClass = isPortraitContent
    ? "bg-black flex items-center justify-center overflow-hidden relative w-full aspect-[9/16] max-h-screen"
    : "bg-black flex items-center justify-center overflow-hidden relative flex-1";

  const playerStyle = isPortraitContent
    ? { maxWidth: '100vw', maxHeight: '100vh' }
    : { height: '100vh', maxWidth: 'calc(100vw - 8rem)' };

  return (
    <div className={containerClass} style={{width: '100vw', height: '100vh'}}>
      {/* Device Info Header */}
      {deviceId && (
        <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            <div>
              <div className="font-medium">{deviceName || 'TVBox'}</div>
              <div className="text-xs opacity-75">ID: {deviceId}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Connection Status */}
      <div className="absolute top-4 right-4 z-20">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
          isOnline ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <Wifi className="w-4 h-4" />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      
      <div className="flex flex-col items-center justify-center w-full h-full">
        {/* Media Content - Responsive Layout */}
        <div className={mediaContainerClass}>
          {/* Navigation Buttons - Only show for landscape or when not portrait */}
          {!isPortraitContent && (
            <button
              onClick={goToPrevious}
              className="w-16 h-16 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 flex-shrink-0 z-10"
              disabled={content.length <= 1}
            >
              <ChevronLeft className="w-8 h-8 text-white" />
            </button>
          )}

          {/* Media Player - Responsive */}
          <div className={playerClass} style={playerStyle}>
            {(currentContent.categoria === 'video' || currentContent.type === 'video') ? (
              <>
                {isLoadingVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                      <p>Carregando vídeo otimizado...</p>
                      <p className="text-sm mt-2 opacity-75">
                        Qualidade: {adaptiveQuality} | Rede: {networkQuality === 'high' ? 'Excelente' : networkQuality === 'medium' ? 'Boa' : 'Limitada'}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Network Quality Indicator */}
                <div className="absolute top-4 right-4 z-10">
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    networkQuality === 'high' ? 'bg-green-600 text-white' :
                    networkQuality === 'medium' ? 'bg-yellow-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    {adaptiveQuality}
                  </div>
                </div>
                
                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                    <div className="text-white text-center">
                      <p className="text-red-400 mb-2">{videoError}</p>
                      <p className="text-sm">Tentando próximo conteúdo...</p>
                    </div>
                  </div>
                )}
                
                <video
                  key={currentContent.id}
                  ref={(el) => {
                    setVideoRef(el);
                    if (el) {
                      videoElementRef.current = el;
                      // Load video with optimizations when element is ready
                      loadVideoWithFallbacks(currentContent);
                    }
                  }}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  playsInline
                  controls={false}
                  preload="metadata"
                  style={{objectFit: 'cover', width: '100%', height: '100%'}}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    setVideoDuration(video.duration);
                    
                    // Determine aspect ratio
                    const aspectRatio = video.videoWidth / video.videoHeight;
                    if (aspectRatio < 0.8) {
                      setMediaAspectRatio('portrait'); // Story format (9:16 or similar)
                    } else if (aspectRatio > 1.2) {
                      setMediaAspectRatio('landscape');
                    } else {
                      setMediaAspectRatio('square');
                    }
                    
                    // Try to play video with better error handling
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                      playPromise.then(() => {
                        setIsVideoPlaying(true);
                        setShowPlayButton(false);
                        setAutoplayFailed(false);
                        setVideoError(null);
                      }).catch((error) => {
                        console.warn('Autoplay failed:', error);
                        setIsVideoPlaying(false);
                        setShowPlayButton(true);
                        setAutoplayFailed(true);
                      });
                    }
                  }}
                  onEnded={() => {
                    setIsVideoPlaying(false);
                    // Advance to next content when video ends
                    setCurrentIndex((prevIndex) => (prevIndex + 1) % content.length);
                  }}
                  onError={(e) => {
                    const error = (e.target as HTMLVideoElement).error;
                    console.error('Video error:', error);
                    setVideoError(`Erro no vídeo: ${error?.message || 'Formato não suportado'}`);
                    
                    // Try to advance after showing error briefly
                    setTimeout(() => {
                      setCurrentIndex((prevIndex) => (prevIndex + 1) % content.length);
                    }, 3000);
                  }}
                  onCanPlay={() => {
                    setIsLoadingVideo(false);
                  }}
                  onWaiting={() => {
                    setIsLoadingVideo(true);
                  }}
                  onPlaying={() => {
                    setIsLoadingVideo(false);
                  }}
              >
                {/* Optimized video sources with comprehensive fallbacks */}
                {cachedVideoUrl && (
                  <source src={cachedVideoUrl} type={`video/${getVideoFormat(cachedVideoUrl)}`} />
                )}
                
                {/* MP4 fallbacks (highest compatibility) */}
                {currentContent.file_path && (
                  <>
                    <source 
                      src={`http://172.16.88.14:3001/api/v1/video-processing/stream/${currentContent.id}?quality=${adaptiveQuality}&format=mp4`}
                      type="video/mp4; codecs='avc1.42E01E, mp4a.40.2'"
                    />
                    <source 
                      src={`http://172.16.88.14:3001/${currentContent.file_path.split('\\').join('/')}`}
                      type="video/mp4"
                    />
                  </>
                )}
                
                {/* WebM fallbacks (modern browsers) */}
                {videoCapabilities?.supportedFormats.some(f => f.extension === 'webm') && currentContent.file_path && (
                  <>
                    <source 
                      src={`http://172.16.88.14:3001/api/v1/video-processing/stream/${currentContent.id}?quality=${adaptiveQuality}&format=webm`}
                      type="video/webm; codecs='vp9, opus'"
                    />
                    <source 
                      src={`http://172.16.88.14:3001/api/v1/video-processing/stream/${currentContent.id}?quality=${adaptiveQuality}&format=webm`}
                      type="video/webm; codecs='vp8, vorbis'"
                    />
                  </>
                )}
                
                {/* OGV fallbacks (legacy support) */}
                {videoCapabilities?.supportedFormats.some(f => f.extension === 'ogv') && currentContent.file_path && (
                  <source 
                    src={`http://172.16.88.14:3001/api/v1/video-processing/stream/${currentContent.id}?quality=${adaptiveQuality}&format=ogv`}
                    type="video/ogg; codecs='theora, vorbis'"
                  />
                )}
                
                {/* Custom formats from content */}
                {currentContent.formats?.map((format, index) => (
                  <source 
                    key={index}
                    src={format.url} 
                    type={`video/${format.format}`} 
                  />
                ))}
                
                <p className="text-white text-center p-4">
                  Seu navegador não suporta reprodução de vídeo.
                  <br />
                  <small>Formatos suportados: {videoCapabilities?.supportedFormats.join(', ') || 'Detectando...'}</small>
                </p>
              </video>
              
              {/* Play Button Overlay */}
              {showPlayButton && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
                  <button
                    onClick={handlePlayClick}
                    className="w-20 h-20 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110"
                  >
                    <svg className="w-8 h-8 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-70 px-3 py-1 rounded">
                    Toque para reproduzir
                  </div>
                </div>
              )}
              </>
            ) : (currentContent.categoria === 'imagem' || currentContent.type === 'image') ? (
              <img
                key={currentContent.id}
                src={currentContent.file_path ? `http://172.16.88.14:3001/${currentContent.file_path.split('\\').join('/')}` : '/api/placeholder/800/450'}
                alt={currentContent.nome}
                className="w-full h-full object-cover"
                style={{objectFit: 'cover', width: '100%', height: '100%'}}
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  const aspectRatio = img.naturalWidth / img.naturalHeight;
                  if (aspectRatio < 0.8) {
                    setMediaAspectRatio('portrait'); // Story format
                  } else if (aspectRatio > 1.2) {
                    setMediaAspectRatio('landscape');
                  } else {
                    setMediaAspectRatio('square');
                  }
                }}
                onError={(e) => {
                  // Fallback to placeholder if image fails to load
                  (e.target as HTMLImageElement).src = '/api/placeholder/800/450';
                }}
              />
            ) : (
              // Default placeholder for other content types
              <div className="text-center">
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Volume2 className="h-12 w-12" />
                </div>
                <p className="text-xl text-gray-400">
                  {currentContent.categoria === 'documento' ? 'Documento' : 'Conteúdo'}
                </p>
              </div>
            )}
          </div>

          {/* Navigation Buttons - Only show for landscape or when not portrait */}
          {!isPortraitContent && (
            <button
              onClick={goToNext}
              className="w-16 h-16 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110 flex-shrink-0 z-10"
              disabled={content.length <= 1}
            >
              <ChevronRight className="w-8 h-8 text-white" />
            </button>
          )}
          
          {/* Portrait Navigation - Touch/Swipe Areas */}
          {isPortraitContent && (
            <>
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={goToPrevious}
                  className="w-12 h-12 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110"
                  disabled={content.length <= 1}
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={goToNext}
                  className="w-12 h-12 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-110"
                  disabled={content.length <= 1}
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Progress Indicator - Positioned at bottom */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex justify-center space-x-2 z-10">
          {content.map((_, index) => (
            <div
              key={index}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentIndex ? 'bg-white' : 'bg-white bg-opacity-40'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TVBoxDisplay;