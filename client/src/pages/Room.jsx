import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Film,
  Users,
  MessageSquare,
  ListMusic,
  Vote,
  Share2,
  Copy,
  Check,
  LogOut,
  Sparkles,
  Settings,
  Compass,
  AlertCircle,
  Plus,
  Upload
} from 'lucide-react';
import { socket, clientId } from '../lib/socket';

import Player from '../components/Player';
import Chat from '../components/Chat';
import Playlist from '../components/Playlist';
import Polls from '../components/Polls';
import MembersList from '../components/MembersList';
import CustomVideoModal from '../components/CustomVideoModal';
import Discover from '../components/Discover';

export default function Room({ roomCode, initialSnapshot, userName, onLeaveRoom, movies = [] }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot || null);
  const [playbackState, setPlaybackState] = useState(initialSnapshot?.playback || null);
  const [playlist, setPlaylist] = useState(initialSnapshot?.playlist || []);
  const [chatMessages, setChatMessages] = useState(initialSnapshot?.chat || []);
  const [polls, setPolls] = useState(initialSnapshot?.polls || {});
  const [members, setMembers] = useState(initialSnapshot?.members || {});
  const [hostId, setHostId] = useState(initialSnapshot?.hostId || '');
  const [controlMode, setControlMode] = useState(initialSnapshot?.controlMode || 'everyone');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'playlist' | 'polls' | 'members'
  const [showCustomVideoModal, setShowCustomVideoModal] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [roomAlert, setRoomAlert] = useState('');
  const [floatingReactions, setFloatingReactions] = useState([]);

  const isHost = hostId === clientId;

  // Find currently active movie metadata (custom stream or catalog movie)
  const currentVideo = useMemo(() => {
    if (playbackState?.videoUrl) {
      return {
        id: playbackState.videoId,
        title: playbackState.title || 'Video Stream',
        videoUrl: playbackState.videoUrl
      };
    }
    return null;
  }, [playbackState?.videoId, playbackState?.videoUrl, playbackState?.title]);

  // Set up socket listeners
  useEffect(() => {
    // 1. Snapshot
    const handleSnapshot = (snap) => {
      setSnapshot(snap);
      setPlaybackState(snap.playback);
      setPlaylist(snap.playlist || []);
      setChatMessages(snap.chat || []);
      setPolls(snap.polls || {});
      setMembers(snap.members || {});
      setHostId(snap.hostId);
      setControlMode(snap.controlMode || 'everyone');
    };

    // 2. Playback update
    const handlePlaybackUpdate = (update) => {
      setPlaybackState((prev) => {
        // Ignore if older version
        if (prev && update.version <= prev.version) {
          return prev;
        }
        return update;
      });
    };

    // 3. Heartbeat
    const handleHeartbeat = (hb) => {
      setPlaybackState((prev) => {
        if (!prev) return hb;
        // Don't downgrade version
        if (hb.version < prev.version) return prev;
        return { ...prev, ...hb };
      });
    };

    // 4. Member joined
    const handleMemberJoined = ({ member }) => {
      setMembers((prev) => ({
        ...prev,
        [member.clientId]: member
      }));
    };

    // 5. Member status
    const handleMemberStatus = (data) => {
      setMembers((prev) => {
        if (!prev[data.clientId]) return prev;
        return {
          ...prev,
          [data.clientId]: {
            ...prev[data.clientId],
            ...data
          }
        };
      });
    };

    const handleMemberStatusBulk = ({ members: bulkMembers }) => {
      setMembers(bulkMembers);
    };

    // 6. Member left
    const handleMemberLeft = ({ clientId: leftId }) => {
      setMembers((prev) => {
        const updated = { ...prev };
        if (updated[leftId]) {
          updated[leftId].connected = false;
        }
        return updated;
      });
    };

    // 7. Host change
    const handleHostChange = ({ hostId: newHostId, reason }) => {
      setHostId(newHostId);
      const name = members[newHostId]?.name || 'Participant';
      setRoomAlert(`Crown transferred! ${name} is now the party host.`);
      setTimeout(() => setRoomAlert(''), 5000);
    };

    // 8. Control mode change
    const handleControlModeChange = ({ controlMode: newMode }) => {
      setControlMode(newMode);
      setRoomAlert(
        newMode === 'host'
          ? 'Host switched controls to Host-Only.'
          : 'Host opened playback controls to Everyone!'
      );
      setTimeout(() => setRoomAlert(''), 4000);
    };

    // 9. Playlist update
    const handlePlaylistUpdate = ({ playlist: newPlaylist }) => {
      setPlaylist(newPlaylist);
    };

    // 10. Chat message
    const handleChatMessage = (msg) => {
      setChatMessages((prev) => [...prev.slice(-199), msg]);
    };

    // 11. Reaction
    const handleReaction = (reaction) => {
      triggerReactionVisual(reaction.emoji);
    };

    // 12. Poll update
    const handlePollUpdate = ({ poll }) => {
      setPolls((prev) => ({
        ...prev,
        [poll.id]: poll
      }));
    };

    // 13. Kicked
    const handleKicked = ({ message }) => {
      alert(message || 'You were kicked from the room.');
      onLeaveRoom();
    };

    socket.on('room:snapshot', handleSnapshot);
    socket.on('playback:update', handlePlaybackUpdate);
    socket.on('playback:heartbeat', handleHeartbeat);
    socket.on('member:joined', handleMemberJoined);
    socket.on('member:status', handleMemberStatus);
    socket.on('member:status_bulk', handleMemberStatusBulk);
    socket.on('member:left', handleMemberLeft);
    socket.on('room:host', handleHostChange);
    socket.on('room:controlMode', handleControlModeChange);
    socket.on('playlist:update', handlePlaylistUpdate);
    socket.on('chat:message', handleChatMessage);
    socket.on('reaction:show', handleReaction);
    socket.on('poll:update', handlePollUpdate);
    socket.on('room:kicked', handleKicked);

    return () => {
      socket.off('room:snapshot', handleSnapshot);
      socket.off('playback:update', handlePlaybackUpdate);
      socket.off('playback:heartbeat', handleHeartbeat);
      socket.off('member:joined', handleMemberJoined);
      socket.off('member:status', handleMemberStatus);
      socket.off('member:status_bulk', handleMemberStatusBulk);
      socket.off('member:left', handleMemberLeft);
      socket.off('room:host', handleHostChange);
      socket.off('room:controlMode', handleControlModeChange);
      socket.off('playlist:update', handlePlaylistUpdate);
      socket.off('chat:message', handleChatMessage);
      socket.off('reaction:show', handleReaction);
      socket.off('poll:update', handlePollUpdate);
      socket.off('room:kicked', handleKicked);
    };
  }, [members, onLeaveRoom]);

  // Trigger floating reaction animation
  const triggerReactionVisual = useCallback((emoji) => {
    const id = Math.random().toString(36).substring(2);
    const x = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2400);
  }, []);

  const handleCopyLink = () => {
    const link = `${window.location.origin}/r/${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleLeave = () => {
    socket.emit('room:leave');
    onLeaveRoom();
  };

  return (
    <div
      id="syncwatch-room-page"
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-darkest)'
      }}
    >
      {/* Room Top Header Bar */}
      <header
        style={{
          height: '62px',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(8, 3, 4, 0.97)',
          backdropFilter: 'blur(12px)',
          zIndex: 30
        }}
      >
        {/* Brand & Room Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Film size={18} color="#fff" />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#fff' }}>
              Ciné-<span style={{ color: '#ef4444' }}>Collectif</span>
            </span>
          </div>

          <div style={{ height: 20, width: 1, backgroundColor: 'var(--border-subtle)' }} />

          {/* Room Code Badge */}
          <div
            id="room-code-badge"
            className="badge badge-red"
            onClick={handleCopyCode}
            style={{
              cursor: 'pointer',
              padding: '6px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem'
            }}
            title="Click to copy room code"
          >
            ROOM: {roomCode}
            {copiedLink ? <Check size={12} color="#fca5a5" /> : <Copy size={12} />}
          </div>

          {/* Invite Link Button */}
          <button
            id="copy-invite-link-btn"
            onClick={handleCopyLink}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
          >
            <Share2 size={13} /> {copiedLink ? 'Copied Link!' : 'Invite'}
          </button>
        </div>

        {/* Center / Alerts */}
        {roomAlert && (
          <div
            style={{
              padding: '4px 14px',
              backgroundColor: 'rgba(220, 38, 38, 0.2)',
              border: '1px solid var(--accent-red)',
              borderRadius: '9999px',
              fontSize: '0.82rem',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              animation: 'pulseGlow 2s infinite'
            }}
          >
            <Sparkles size={14} />
            {roomAlert}
          </div>
        )}

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Catalog / Discover Button */}
          <button
            id="open-catalog-header-btn"
            onClick={() => setShowDiscover(true)}
            className="btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.82rem' }}
            title="Browse movie discovery catalog"
          >
            <Compass size={14} color="#ef4444" /> Catalog
          </button>

          {/* Custom Video / Upload Button */}
          <button
            id="open-custom-video-btn"
            onClick={() => setShowCustomVideoModal(true)}
            className="btn-primary"
            style={{ padding: '7px 16px', fontSize: '0.82rem' }}
            title="Insert a YouTube link or upload video file"
          >
            <Upload size={14} /> Insert Video / File
          </button>

          {/* Leave Button */}
          <button
            id="leave-room-btn"
            onClick={handleLeave}
            className="btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.82rem', color: '#fca5a5' }}
            title="Leave Watch Party"
          >
            <LogOut size={14} /> Leave
          </button>
        </div>
      </header>

      {/* Main Split Layout: Player on Left, Side Panels on Right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Cinema Player Container */}
        <div
          style={{
            flex: 1,
            height: '100%',
            backgroundColor: '#000',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Player
            currentVideo={currentVideo}
            playbackState={playbackState}
            isHost={isHost}
            controlMode={controlMode}
            reactions={floatingReactions}
            onOpenCustomVideo={() => setShowCustomVideoModal(true)}
          />
        </div>

        {/* Right: Tabbed Interaction Sidebar */}
        <div
          id="room-interaction-sidebar"
          style={{
            width: '380px',
            maxWidth: '100%',
            height: '100%',
            backgroundColor: 'var(--bg-darker)',
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: 'rgba(0,0,0,0.2)'
            }}
          >
            <button
              id="tab-btn-chat"
              onClick={() => setActiveTab('chat')}
              style={{
                flex: 1,
                padding: '12px 6px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'chat' ? '2px solid var(--accent-red)' : '2px solid transparent',
                color: activeTab === 'chat' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'chat' ? 600 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <MessageSquare size={14} /> Chat
            </button>

            <button
              id="tab-btn-playlist"
              onClick={() => setActiveTab('playlist')}
              style={{
                flex: 1,
                padding: '12px 6px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'playlist' ? '2px solid var(--accent-red)' : '2px solid transparent',
                color: activeTab === 'playlist' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'playlist' ? 600 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <ListMusic size={14} /> Queue ({playlist.length})
            </button>

            <button
              id="tab-btn-polls"
              onClick={() => setActiveTab('polls')}
              style={{
                flex: 1,
                padding: '12px 6px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'polls' ? '2px solid var(--accent-red)' : '2px solid transparent',
                color: activeTab === 'polls' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'polls' ? 600 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Vote size={14} /> Polls
            </button>

            <button
              id="tab-btn-members"
              onClick={() => setActiveTab('members')}
              style={{
                flex: 1,
                padding: '12px 6px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'members' ? '2px solid var(--accent-red)' : '2px solid transparent',
                color: activeTab === 'members' ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === 'members' ? 600 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Users size={14} /> ({Object.values(members).filter((m) => m.connected).length})
            </button>
          </div>

          {/* Tab Content Panes */}
          <div style={{ flex: 1, overflow: 'hidden', padding: '10px' }}>
            {activeTab === 'chat' && (
              <Chat
                messages={chatMessages}
                members={members}
                onTriggerReaction={triggerReactionVisual}
              />
            )}

            {activeTab === 'playlist' && (
              <Playlist
                playlist={playlist}
                currentVideoId={playbackState?.videoId}
                isHost={isHost}
                controlMode={controlMode}
                movies={movies}
                onOpenCatalog={() => setShowDiscover(true)}
                onOpenCustomVideo={() => setShowCustomVideoModal(true)}
              />
            )}

            {activeTab === 'polls' && (
              <Polls
                polls={polls}
                isHost={isHost}
              />
            )}

            {activeTab === 'members' && (
              <MembersList
                members={members}
                hostId={hostId}
                isHost={isHost}
                controlMode={controlMode}
              />
            )}
          </div>
        </div>
      </div>

      {/* Movie Discovery Modal */}
      {showDiscover && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}
        >
          <Discover
            movies={movies}
            onClose={() => setShowDiscover(false)}
            canControl={controlMode === 'everyone' || isHost}
            onOpenCustomVideo={() => {
              setShowDiscover(false);
              setShowCustomVideoModal(true);
            }}
          />
        </div>
      )}

      {/* Custom Video URL / File Upload Modal */}
      {showCustomVideoModal && (
        <CustomVideoModal
          onClose={() => setShowCustomVideoModal(false)}
          canControl={controlMode === 'everyone' || isHost}
        />
      )}
    </div>
  );
}
