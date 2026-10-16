import React, { useState, useRef } from 'react';
import { Link2, Upload, Play, Plus, X, Film, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { socket, generateCmdId, clientId } from '../lib/socket';

export default function CustomVideoModal({ onClose, canControl, onVideoLoaded }) {
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'upload'
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const handlePlayNowUrl = (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    const title = videoTitle.trim() || 'Custom Video Stream';
    const cmdId = generateCmdId();

    socket.emit('playback:load', {
      cmdId,
      videoId: `custom_${Date.now()}`,
      videoUrl: videoUrl.trim(),
      title,
      clientId
    });

    if (onVideoLoaded) onVideoLoaded({ videoUrl: videoUrl.trim(), title });
    onClose();
  };

  const handleAddToQueueUrl = () => {
    if (!videoUrl.trim()) return;
    const title = videoTitle.trim() || 'Custom Video Stream';

    socket.emit('playlist:add', {
      videoId: `custom_${Date.now()}`,
      videoUrl: videoUrl.trim(),
      title
    });

    onClose();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!videoTitle) {
        setVideoTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMsg('');
    }
  };

  const handleUploadAndPlay = async (autoPlay = true) => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(15);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('video', selectedFile);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 90);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status === 200) {
          const res = JSON.parse(xhr.responseText);
          setUploadProgress(100);
          setUploadSuccess(res);

          const title = videoTitle.trim() || res.title;
          const cmdId = generateCmdId();

          if (autoPlay) {
            socket.emit('playback:load', {
              cmdId,
              videoId: `upload_${Date.now()}`,
              videoUrl: res.videoUrl,
              title,
              clientId
            });
            if (onVideoLoaded) onVideoLoaded({ videoUrl: res.videoUrl, title });
            onClose();
          } else {
            socket.emit('playlist:add', {
              videoId: `upload_${Date.now()}`,
              videoUrl: res.videoUrl,
              title
            });
            onClose();
          }
        } else {
          setErrorMsg('Failed to upload video file. Check file size (max 1GB).');
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        setErrorMsg('Network error while uploading video.');
      };

      xhr.send(formData);
    } catch (err) {
      setIsUploading(false);
      setErrorMsg(err.message || 'Error uploading file');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 150,
        padding: '16px'
      }}
    >
      <div
        className="glass-modal"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Film size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Watch Your Own Video</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Insert an online video link or select a local video file
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ width: 34, height: 34 }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            borderRadius: '12px',
            padding: '4px',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <button
            onClick={() => setActiveTab('url')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'url' ? 'var(--accent-gradient)' : 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.2s ease'
            }}
          >
            <Link2 size={16} /> Video Link
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'upload' ? 'var(--accent-gradient)' : 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.2s ease'
            }}
          >
            <Upload size={16} /> Video File
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(220, 38, 38, 0.2)',
              border: '1px solid var(--accent-red)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <AlertCircle size={15} />
            {errorMsg}
          </div>
        )}

        {/* Tab 1: Video URL */}
        {activeTab === 'url' && (
          <form onSubmit={handlePlayNowUrl} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                YouTube URL or Direct Video Stream (.mp4, .webm, etc.)
              </label>
              <input
                id="custom-video-url-input"
                type="url"
                placeholder="https://www.youtube.com/watch?v=... or .mp4 URL"
                value={videoUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setVideoUrl(val);
                  if (!videoTitle && (val.includes('youtube.com') || val.includes('youtu.be'))) {
                    setVideoTitle('YouTube Stream');
                  }
                }}
                className="input-field"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                Video Title (Optional)
              </label>
              <input
                id="custom-video-title-input"
                type="text"
                placeholder="e.g. My Movie Night Feature"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className="input-field"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                id="custom-video-play-btn"
                type="submit"
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={!canControl || !videoUrl.trim()}
                title={canControl ? 'Play video now in room' : 'Host only'}
              >
                <Play size={16} fill="#fff" /> Play Now
              </button>
              <button
                id="custom-video-queue-btn"
                type="button"
                onClick={handleAddToQueueUrl}
                className="btn-secondary"
                disabled={!videoUrl.trim()}
              >
                <Plus size={16} /> Add to Queue
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Upload Local Video File */}
        {activeTab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-subtle)',
                borderRadius: '14px',
                padding: '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: 'rgba(220, 38, 38, 0.04)',
                transition: 'border-color 0.2s ease, background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-red)';
                e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.04)';
              }}
            >
              <Upload size={32} color="#ef4444" style={{ margin: '0 auto 10px' }} />
              {selectedFile ? (
                <div>
                  <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>
                    {selectedFile.name}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Click to choose different file
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>
                    Click to browse your computer
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Supports MP4, WebM, MOV, and common video files (up to 1GB)
                  </p>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                Display Title
              </label>
              <input
                type="text"
                placeholder="Video title"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className="input-field"
              />
            </div>

            {isUploading && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Uploading to party stream...</span>
                  <span style={{ color: '#fca5a5', fontWeight: 600 }}>{uploadProgress}%</span>
                </div>
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    backgroundColor: '#1f080c',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${uploadProgress}%`,
                      background: 'var(--accent-gradient)',
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => handleUploadAndPlay(true)}
                disabled={!selectedFile || isUploading || !canControl}
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                title={canControl ? 'Upload and play immediately' : 'Host only'}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Play size={16} fill="#fff" /> Upload & Play Now
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleUploadAndPlay(false)}
                disabled={!selectedFile || isUploading}
                className="btn-secondary"
              >
                <Plus size={16} /> Add to Queue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
