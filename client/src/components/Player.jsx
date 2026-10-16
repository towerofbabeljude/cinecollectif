import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Activity,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Volume1
} from 'lucide-react';
import { socket, generateCmdId, clientId } from '../lib/socket';
import { DriftCorrector } from '../lib/driftCorrector';
import { clockSync } from '../lib/clockSync';

function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export default function Player({
  currentVideo,
  playbackState,
  isHost,
  controlMode,
  reactions,
  onOpenCustomVideo,
  onOpenCatalog
}) {
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const correctorRef = useRef(null);
  const containerRef = useRef(null);

  const youtubeId = getYouTubeId(currentVideo?.videoUrl);
  const [ytReady, setYtReady] = useState(false);
  const [ytError, setYtError] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showHud, setShowHud] = useState(false);
  const [needsAutoplayUnlock, setNeedsAutoplayUnlock] = useState(false);
  const [syncStats, setSyncStats] = useState({
    driftMs: 0,
    rate: 1.0,
    status: 'synced',
    expectedSec: 0,
    actualSec: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [clockData, setClockData] = useState({
    offset: clockSync.offset,
    rtt: clockSync.rtt,
    synced: clockSync.synced
  });
  const [videoSrc, setVideoSrc] = useState(() => {
    return youtubeId ? '' : (currentVideo?.videoUrl || '');
  });
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  useEffect(() => {
    setHasPlaybackError(false);
    if (!youtubeId) {
      setVideoSrc(currentVideo?.videoUrl || '');
    }
  }, [currentVideo?.videoUrl, youtubeId]);

  const handleVideoError = () => {
    if (youtubeId || !videoSrc) return;
    console.warn('Video failed to load source:', videoSrc);
    setHasPlaybackError(true);
  };

  const controlsTimeoutRef = useRef(null);

  const canControl = controlMode === 'everyone' || isHost;

  // Initialize DriftCorrector on mount (for HTML5 video)
  useEffect(() => {
    if (!videoRef.current || youtubeId) return;
    const video = videoRef.current;

    const corrector = new DriftCorrector(video, (logEntry) => {
      setRecentLogs((prev) => [logEntry, ...prev.slice(0, 19)]);
    });

    correctorRef.current = corrector;
    const unsubStats = corrector.onStatsChange((stats) => {
      setSyncStats({ ...stats });
    });

    const unsubClock = clockSync.onChange((cd) => {
      setClockData({ ...cd });
    });

    return () => {
      unsubStats();
      unsubClock();
      corrector.destroy();
    };
  }, [youtubeId]);

  // YouTube IFrame Player Lifecycle
  useEffect(() => {
    if (!youtubeId) {
      setYtReady(false);
      setYtError('');
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
        ytPlayerRef.current = null;
      }
      return;
    }

    let isSubscribed = true;

    const setupPlayer = () => {
      if (!isSubscribed) return;
      if (!window.YT || !window.YT.Player) {
        setTimeout(setupPlayer, 150);
        return;
      }

      const el = document.getElementById('youtube-player-container');
      if (!el) {
        setTimeout(setupPlayer, 100);
        return;
      }

      if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        try {
          ytPlayerRef.current.loadVideoById(youtubeId);
          setYtReady(true);
          return;
        } catch (e) {
          try { ytPlayerRef.current.destroy(); } catch (err) {}
        }
      }

      try {
        ytPlayerRef.current = new window.YT.Player('youtube-player-container', {
          videoId: youtubeId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (!isSubscribed) return;
              setYtReady(true);
              setYtError('');
              const d = event.target.getDuration();
              if (d) setDuration(d);
              socket.emit('member:ready', { buffering: false });

              if (playbackState) {
                const now = Date.now();
                const expectedPos = playbackState.state === 'playing'
                  ? playbackState.position + (now - playbackState.updatedAt) / 1000
                  : playbackState.position;
                if (expectedPos > 0) event.target.seekTo(expectedPos, true);
                if (playbackState.state === 'playing') {
                  event.target.playVideo();
                  setIsPlaying(true);
                } else {
                  event.target.pauseVideo();
                  setIsPlaying(false);
                }
              }
            },
            onStateChange: (event) => {
              if (!isSubscribed) return;
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
                socket.emit('member:ready', { buffering: false });
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              } else if (event.data === window.YT.PlayerState.BUFFERING) {
                socket.emit('member:ready', { buffering: true });
              }
            },
            onError: (event) => {
              console.warn('YouTube Player error code:', event.data);
              if (event.data === 101 || event.data === 150) {
                setYtError('This YouTube video disables external embedding. Please try another YouTube video.');
              } else {
                setYtError('Failed to load YouTube stream (Error code ' + event.data + ').');
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to init YouTube player:', err);
      }
    };

    setupPlayer();

    return () => {
      isSubscribed = false;
    };
  }, [youtubeId]);

  // Sync YouTube time & duration for scrubber bar
  useEffect(() => {
    if (!youtubeId) return;
    const interval = setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
        try {
          const t = ytPlayerRef.current.getCurrentTime();
          const d = ytPlayerRef.current.getDuration();
          if (typeof t === 'number' && !isNaN(t)) setCurrentTime(t);
          if (typeof d === 'number' && !isNaN(d) && d > 0) setDuration(d);
        } catch (e) {}
      }
    }, 500);
    return () => clearInterval(interval);
  }, [youtubeId]);

  // Update playbackState from server changes
  useEffect(() => {
    if (!playbackState) return;

    if (youtubeId && ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === 'function') {
      try {
        const yt = ytPlayerRef.current;
        const now = Date.now();
        const expectedPos = playbackState.state === 'playing'
          ? playbackState.position + (now - playbackState.updatedAt) / 1000
          : playbackState.position;

        const currentPos = yt.getCurrentTime() || 0;
        const drift = Math.abs(currentPos - expectedPos);

        if (drift > 1.5) {
          yt.seekTo(expectedPos, true);
        }

        if (playbackState.state === 'playing') {
          yt.playVideo();
          setIsPlaying(true);
        } else {
          yt.pauseVideo();
          setIsPlaying(false);
        }
      } catch (e) {
        console.warn('YouTube sync error:', e);
      }
      return;
    }

    if (!correctorRef.current || !videoRef.current) return;
    const video = videoRef.current;

    correctorRef.current.setPlaybackState(playbackState);

    // Synchronize play/pause state
    if (playbackState.state === 'playing') {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setNeedsAutoplayUnlock(false);
          })
          .catch(() => {
            video.muted = true;
            video.play()
              .then(() => {
                setIsPlaying(true);
                setIsMuted(true);
                setNeedsAutoplayUnlock(false);
              })
              .catch((err) => {
                console.warn('Autoplay blocked even muted:', err);
                setNeedsAutoplayUnlock(true);
              });
          });
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [playbackState, youtubeId]);

  // Handle Video Element Events
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
      socket.emit('member:ready', { buffering: false });
    }
  };

  const handleWaiting = () => {
    socket.emit('member:ready', { buffering: true });
  };

  const handlePlaying = () => {
    socket.emit('member:ready', { buffering: false });
    setIsPlaying(true);
  };

  // User Actions: Send authoritative commands to server
  const handleTogglePlay = () => {
    if (!canControl) return;
    const cmdId = generateCmdId();

    if (youtubeId && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
      const pos = ytPlayerRef.current.getCurrentTime() || 0;
      if (isPlaying) {
        ytPlayerRef.current.pauseVideo();
        setIsPlaying(false);
        socket.emit('playback:pause', { cmdId, position: pos, clientId });
      } else {
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
        socket.emit('playback:play', { cmdId, position: pos, clientId });
      }
      return;
    }

    const video = videoRef.current;
    const pos = video ? video.currentTime : 0;

    if (isPlaying) {
      socket.emit('playback:pause', { cmdId, position: pos, clientId });
    } else {
      if (video) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setNeedsAutoplayUnlock(false);
            })
            .catch(() => {
              video.muted = true;
              setIsMuted(true);
              video.play()
                .then(() => {
                  setIsPlaying(true);
                  setNeedsAutoplayUnlock(false);
                })
                .catch(console.error);
            });
        }
      }
      socket.emit('playback:play', { cmdId, position: pos, clientId });
    }
  };

  const handleSeek = (e) => {
    if (!canControl || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetPos = newPercent * duration;

    const cmdId = generateCmdId();
    if (youtubeId && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
      ytPlayerRef.current.seekTo(targetPos, true);
      setCurrentTime(targetPos);
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetPos;
      setCurrentTime(targetPos);
    }
    socket.emit('playback:seek', { cmdId, position: targetPos, clientId });
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (youtubeId && ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      ytPlayerRef.current.setVolume(val * 100);
      if (val === 0) {
        ytPlayerRef.current.mute();
        setIsMuted(true);
      } else {
        ytPlayerRef.current.unMute();
        setIsMuted(false);
      }
    } else if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (youtubeId && ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function') {
      if (next) {
        ytPlayerRef.current.mute();
      } else {
        ytPlayerRef.current.unMute();
        if (volume === 0) setVolume(0.5);
      }
    } else if (videoRef.current) {
      videoRef.current.muted = next;
      if (!next && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  // Autoplay Unlock Handler (Section 5.4)
  const handleUnlockAutoplay = () => {
    if (youtubeId && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.unMute();
        ytPlayerRef.current.playVideo();
        setNeedsAutoplayUnlock(false);
        setIsPlaying(true);
      } catch (e) {}
      return;
    }
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play()
        .then(() => {
          setNeedsAutoplayUnlock(false);
          setIsPlaying(true);
          if (correctorRef.current) {
            correctorRef.current.checkAndCorrect();
          }
        })
        .catch(console.error);
    }
  };

  // Helper format time
  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3200);
  };

  return (
    <div
      ref={containerRef}
      id="syncwatch-player-container"
      onMouseMove={handleMouseMove}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        borderRadius: isFullscreen ? 0 : '16px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)'
      }}
    >
      {/* Video or YouTube Player */}
      {youtubeId ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000'
          }}
        >
          <div
            id="youtube-player-container"
            style={{ width: '100%', height: '100%' }}
          />
          {ytError && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(5, 2, 3, 0.92)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                zIndex: 20
              }}
            >
              <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: 12 }}>{ytError}</p>
              <button onClick={onOpenCatalog} className="btn-primary">
                Browse Movies Catalog
              </button>
            </div>
          )}
        </div>
      ) : (
        <video
          ref={videoRef}
          id="syncwatch-video-element"
          src={videoSrc}
          poster={currentVideo?.poster}
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onError={handleVideoError}
          onClick={handleTogglePlay}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            cursor: canControl ? 'pointer' : 'default'
          }}
        />
      )}

      {/* Floating Reactions Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 40
        }}
      >
        {reactions.map((r) => (
          <div
            key={r.id}
            className="floating-emoji"
            style={{
              left: `${r.x || 30 + Math.random() * 40}%`,
              bottom: '15%'
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Autoplay Unlock Overlay */}
      {needsAutoplayUnlock && (
        <div
          id="autoplay-unlock-banner"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 2, 3, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '24px'
          }}
        >
          <div
            style={{
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: '440px',
              background: 'rgba(18, 5, 8, 0.96)',
              borderRadius: '24px',
              border: '1px solid rgba(220, 38, 38, 0.45)',
              boxShadow: '0 0 32px rgba(220, 38, 38, 0.35)'
            }}
          >
            <Sparkles size={40} color="#ef4444" style={{ marginBottom: 12 }} />
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8, color: '#fff' }}>
              Watch Party in Progress
            </h3>
            <p style={{ color: '#e2e8f0', fontSize: '0.9rem', marginBottom: 20 }}>
              Click below to unmute and join the synchronized playback.
            </p>
            <button
              id="unlock-playback-btn"
              className="btn-primary"
              onClick={handleUnlockAutoplay}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Play size={18} fill="#fff" /> Join Playback
            </button>
          </div>
        </div>
      )}

      {/* Top Bar Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '20px 24px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, transparent 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 50,
          opacity: showControls || !isPlaying ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: showControls || !isPlaying ? 'auto' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>
            {currentVideo?.title || 'Ciné-Collectif Stream'}
          </h2>
          {currentVideo?.year && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ({currentVideo.year})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Simple Clean Status Indicator */}
          <div
            id="sync-status-indicator"
            className="badge badge-red"
            style={{
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: isPlaying ? '#ef4444' : '#fca5a5'
              }}
            />
            {isPlaying ? 'PLAYING' : 'PAUSED'}
          </div>
        </div>
      </div>

      {/* Host Mode Notice if user cannot control */}
      {!canControl && (
        <div
          style={{
            position: 'absolute',
            bottom: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20, 4, 7, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            borderRadius: '9999px',
            padding: '6px 18px',
            fontSize: '0.8rem',
            color: '#fca5a5',
            zIndex: 45,
            pointerEvents: 'none'
          }}
        >
          🔒 Host-Only Mode: Host controls playback
        </div>
      )}

      {/* Bottom Controls Bar Overlay */}
      <div
        id="player-controls-bar"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '24px 20px 14px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 50,
          opacity: showControls || !isPlaying ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: showControls || !isPlaying ? 'auto' : 'none'
        }}
      >
        {/* Scrubber Progress Bar */}
        <div
          id="player-scrubber-bar"
          onClick={handleSeek}
          style={{
            position: 'relative',
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            cursor: canControl ? 'pointer' : 'default',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${duration ? (currentTime / duration) * 100 : 0}%`,
              background: 'var(--accent-gradient)',
              borderRadius: '4px'
            }}
          />
        </div>

        {/* Buttons Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {/* Left Controls: Play/Pause, Volume, Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              id="player-play-pause-btn"
              onClick={handleTogglePlay}
              disabled={!canControl}
              style={{
                background: 'none',
                border: 'none',
                color: canControl ? '#fff' : 'rgba(255,255,255,0.4)',
                cursor: canControl ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center'
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={24} fill="#fff" /> : <Play size={24} fill="#fff" />}
            </button>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={toggleMute}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={20} />
                ) : volume < 0.5 ? (
                  <Volume1 size={20} />
                ) : (
                  <Volume2 size={20} />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={{
                  width: '70px',
                  accentColor: 'var(--accent-red)',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Time Display */}
            <span
              style={{
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)'
              }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              id="player-fullscreen-btn"
              onClick={toggleFullscreen}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
