import React from 'react';
import { ListMusic, Play, Trash2, ArrowUp, ArrowDown, SkipForward, Plus } from 'lucide-react';
import { socket, clientId } from '../lib/socket';

export default function Playlist({
  playlist = [],
  currentVideoId,
  isHost,
  controlMode,
  movies = [],
  onOpenCatalog
}) {
  const canControl = controlMode === 'everyone' || isHost;

  const handleRemove = (itemId) => {
    socket.emit('playlist:remove', { itemId });
  };

  const handleMove = (fromIndex, toIndex) => {
    socket.emit('playlist:reorder', { fromIndex, toIndex });
  };

  const handleSkipNext = () => {
    socket.emit('playlist:next');
  };

  // Find metadata for video
  const getVideoDetails = (videoId) => {
    return movies.find((m) => m.id === videoId) || { title: videoId, durationMin: 0 };
  };

  return (
    <div
      id="syncwatch-playlist-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListMusic size={17} color="#ef4444" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>Party Playlist</h3>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            id="playlist-next-btn"
            onClick={handleSkipNext}
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            disabled={!canControl || playlist.length === 0}
            title="Play next video in queue"
          >
            <SkipForward size={13} /> Next
          </button>
          <button
            id="playlist-add-btn"
            onClick={onOpenCatalog}
            className="btn-primary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Playlist List */}
      <div
        id="playlist-items-list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {playlist.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            <p>Queue is empty.</p>
            <button
              onClick={onOpenCatalog}
              className="btn-secondary"
              style={{ marginTop: 12, fontSize: '0.8rem' }}
            >
              Browse Movies
            </button>
          </div>
        ) : (
          playlist.map((item, index) => {
            const details = getVideoDetails(item.videoId);
            const isCurrent = item.videoId === currentVideoId;
            const canRemove = !isHost && controlMode === 'host' ? item.addedBy === clientId : true;

            return (
              <div
                key={item.itemId}
                className="glass-panel"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: isCurrent ? 'rgba(220, 38, 38, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  border: isCurrent
                    ? '1px solid rgba(220, 38, 38, 0.5)'
                    : '1px solid var(--border-subtle)'
                }}
              >
                {/* Index / Playing icon */}
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isCurrent ? '#ef4444' : 'var(--text-muted)',
                    minWidth: '20px'
                  }}
                >
                  {isCurrent ? <Play size={14} fill="#ef4444" color="#ef4444" /> : index + 1}
                </span>

                {/* Thumbnail if available */}
                {details.poster && (
                  <img
                    src={details.poster}
                    alt={details.title}
                    style={{
                      width: 38,
                      height: 52,
                      objectFit: 'cover',
                      borderRadius: 4
                    }}
                  />
                )}

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: isCurrent ? '#fca5a5' : '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.title || details.title}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {details.durationMin ? `${details.durationMin}m • ` : ''}
                    Added by {item.addedByName || 'Guest'}
                  </div>
                </div>

                {/* Reorder and Delete Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {index > 0 && canControl && (
                    <button
                      onClick={() => handleMove(index, index - 1)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>
                  )}
                  {index < playlist.length - 1 && canControl && (
                    <button
                      onClick={() => handleMove(index, index + 1)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => handleRemove(item.itemId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f43f5e',
                        cursor: 'pointer',
                        padding: '2px 4px'
                      }}
                      title="Remove from playlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
