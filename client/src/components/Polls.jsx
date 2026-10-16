import React, { useState } from 'react';
import { Vote, Plus, CheckCircle, Lock, X } from 'lucide-react';
import { socket, clientId } from '../lib/socket';

export default function Polls({ polls = {}, isHost }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const pollList = Object.values(polls).sort((a, b) => b.createdAt - a.createdAt);

  const handleVote = (pollId, optionId) => {
    socket.emit('poll:vote', { pollId, optionId });
  };

  const handleClosePoll = (pollId) => {
    socket.emit('poll:close', { pollId });
  };

  const handleAddOptionField = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleOptionChange = (idx, val) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const handleCreatePoll = (e) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || validOptions.length < 2) return;

    socket.emit('poll:create', {
      question: question.trim(),
      options: validOptions
    });

    setQuestion('');
    setOptions(['', '']);
    setShowCreateModal(false);
  };

  return (
    <div
      id="syncwatch-polls-panel"
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
          <Vote size={17} color="#ef4444" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>Group Polls</h3>
        </div>
        <button
          id="create-poll-btn"
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
          style={{ padding: '4px 12px', fontSize: '0.78rem' }}
        >
          <Plus size={13} /> New Poll
        </button>
      </div>

      {/* Polls List */}
      <div
        id="polls-list-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        {pollList.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            <p style={{ color: '#fff' }}>No active polls.</p>
            <p style={{ marginTop: 4 }}>Ask the room what to watch next!</p>
          </div>
        ) : (
          pollList.map((poll) => {
            const totalVotes = poll.options.reduce((acc, opt) => acc + opt.votes.length, 0);
            const userVotedOption = poll.options.find((opt) => opt.votes.includes(clientId));
            const canClose = !poll.closed && (isHost || poll.createdBy === clientId);

            return (
              <div
                key={poll.id}
                className="glass-panel"
                style={{
                  padding: '14px 16px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 10
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                      {poll.question}
                    </h4>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      By {poll.createdByName || 'Participant'} • {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                      {poll.closed && ' • (Closed)'}
                    </span>
                  </div>

                  {canClose && (
                    <button
                      onClick={() => handleClosePoll(poll.id)}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                      title="Close poll"
                    >
                      <Lock size={11} /> Close
                    </button>
                  )}
                </div>

                {/* Options List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {poll.options.map((opt) => {
                    const count = opt.votes.length;
                    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isMyVote = opt.votes.includes(clientId);

                    return (
                      <button
                        key={opt.id}
                        id={`poll-vote-btn-${opt.id}`}
                        onClick={() => !poll.closed && handleVote(poll.id, opt.id)}
                        disabled={poll.closed}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: isMyVote
                            ? '1px solid var(--accent-red)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          textAlign: 'left',
                          cursor: poll.closed ? 'default' : 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        {/* Progress Fill */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${percent}%`,
                            backgroundColor: isMyVote
                              ? 'rgba(220, 38, 38, 0.35)'
                              : 'rgba(255, 255, 255, 0.08)',
                            transition: 'width 0.4s ease'
                          }}
                        />

                        {/* Label */}
                        <span
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            fontSize: '0.85rem',
                            fontWeight: isMyVote ? 600 : 500,
                            color: isMyVote ? '#fca5a5' : '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          {isMyVote && <CheckCircle size={14} color="#fca5a5" />}
                          {opt.text}
                        </span>

                        {/* Stats */}
                        <span
                          style={{
                            position: 'relative',
                            zIndex: 1,
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {percent}% ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create Poll Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px'
          }}
        >
          <div
            className="glass-modal"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '24px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
              }}
            >
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Create Group Poll</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-icon"
                style={{ width: 32, height: 32 }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePoll} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Question
                </label>
                <input
                  id="poll-question-input"
                  type="text"
                  placeholder="e.g. Which movie should we watch next?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Options (2 - 6)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {options.map((opt, idx) => (
                    <input
                      key={idx}
                      id={`poll-option-input-${idx}`}
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      className="input-field"
                      required={idx < 2}
                    />
                  ))}
                </div>
              </div>

              {options.length < 6 && (
                <button
                  type="button"
                  onClick={handleAddOptionField}
                  className="btn-secondary"
                  style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  <Plus size={13} /> Add Option
                </button>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  id="submit-poll-btn"
                  type="submit"
                  className="btn-primary"
                  disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
                >
                  Launch Poll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
