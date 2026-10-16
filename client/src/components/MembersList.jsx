import React from 'react';
import { Users, Crown, Loader2, UserMinus, ShieldAlert, Check } from 'lucide-react';
import { socket, clientId } from '../lib/socket';

export default function MembersList({
  members = {},
  hostId,
  isHost,
  controlMode
}) {
  const memberList = Object.values(members).sort((a, b) => {
    if (a.clientId === hostId) return -1;
    if (b.clientId === hostId) return 1;
    return a.joinedAt - b.joinedAt;
  });

  const handleTransferHost = (toClientId) => {
    if (window.confirm('Transfer room host privileges to this participant?')) {
      socket.emit('host:transfer', { toClientId });
    }
  };

  const handleKick = (targetClientId) => {
    if (window.confirm('Kick this participant from the watch party?')) {
      socket.emit('room:kick', { clientId: targetClientId });
    }
  };

  const handleToggleControlMode = () => {
    const nextMode = controlMode === 'everyone' ? 'host' : 'everyone';
    socket.emit('host:controlMode', { mode: nextMode });
  };

  return (
    <div
      id="syncwatch-members-panel"
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
          <Users size={17} color="#ef4444" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>Party Members</h3>
        </div>
        <span className="badge badge-red">
          {Object.values(members).filter((m) => m.connected).length} online
        </span>
      </div>

      {/* Host Control Mode Setting */}
      {isHost && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(220, 38, 38, 0.12)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>Playback Control Mode</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {controlMode === 'everyone' ? 'Anyone can play/pause/seek' : 'Only host can control'}
            </div>
          </div>
          <button
            id="toggle-control-mode-btn"
            onClick={handleToggleControlMode}
            className={controlMode === 'everyone' ? 'btn-secondary' : 'btn-primary'}
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            {controlMode === 'everyone' ? 'Switch to Host Only' : 'Allow Everyone'}
          </button>
        </div>
      )}

      {/* Member Items */}
      <div
        id="members-list-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {memberList.map((m) => {
          const isMemberHost = m.clientId === hostId;
          const isMe = m.clientId === clientId;

          return (
            <div
              key={m.clientId}
              className="glass-panel"
              style={{
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: m.connected ? 1 : 0.5,
                backgroundColor: isMe ? 'rgba(220, 38, 38, 0.12)' : 'rgba(255, 255, 255, 0.02)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Status Dot */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: m.connected ? '#ef4444' : '#64748b'
                  }}
                  title={m.connected ? 'Online' : 'Disconnected'}
                />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                      {m.name} {isMe && '(You)'}
                    </span>
                    {isMemberHost && (
                      <span
                        className="badge badge-dark-red"
                        style={{ padding: '2px 6px', fontSize: '0.65rem' }}
                      >
                        <Crown size={10} color="#fca5a5" /> Host
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {m.buffering ? (
                      <span style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Loader2 size={10} className="animate-spin" /> Buffering...
                      </span>
                    ) : (
                      <span style={{ color: '#ffffff' }}>Ready</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Host Actions for other members */}
              {isHost && !isMe && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleTransferHost(m.clientId)}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                    title="Make this member room host"
                  >
                    <Crown size={12} /> Make Host
                  </button>
                  <button
                    onClick={() => handleKick(m.clientId)}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#ef4444' }}
                    title="Kick from room"
                  >
                    <UserMinus size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
