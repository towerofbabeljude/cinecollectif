import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { Search, Filter, Play, Plus, Vote, Star, Clock, X } from 'lucide-react';
import { socket, generateCmdId, clientId } from '../lib/socket';

export default function Discover({
  movies = [],
  onClose,
  canControl,
  onOpenCustomVideo,
  onCreatePollWithMovie
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState('all'); // all | short | medium | long
  const [minRating, setMinRating] = useState(0);
  const [activeCategory, setActiveCategory] = useState('All');

  // Debounce search input by 150ms as specified in Section 7.2
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Extract all unique genres & categories
  const allGenres = useMemo(() => {
    const set = new Set();
    movies.forEach((m) => m.genres?.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [movies]);

  const allCategories = useMemo(() => {
    const set = new Set(['All']);
    movies.forEach((m) => m.categories?.forEach((c) => set.add(c)));
    return Array.from(set);
  }, [movies]);

  // Fuse.js configured with weights and threshold specified in Section 7.2
  const fuse = useMemo(() => {
    return new Fuse(movies, {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'cast', weight: 0.2 },
        { name: 'tags', weight: 0.2 },
        { name: 'genres', weight: 0.1 }
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2
    });
  }, [movies]);

  // Combined filtering
  const filteredMovies = useMemo(() => {
    let list = movies;

    if (debouncedSearch.trim()) {
      const results = fuse.search(debouncedSearch.trim());
      list = results.map((r) => r.item);
    }

    if (activeCategory !== 'All') {
      list = list.filter((m) => m.categories && m.categories.includes(activeCategory));
    }

    if (selectedGenres.length > 0) {
      list = list.filter((m) =>
        selectedGenres.every((g) => m.genres && m.genres.includes(g))
      );
    }

    if (minRating > 0) {
      list = list.filter((m) => m.rating >= minRating);
    }

    if (selectedDuration === 'short') {
      list = list.filter((m) => m.durationMin <= 20);
    } else if (selectedDuration === 'medium') {
      list = list.filter((m) => m.durationMin > 20 && m.durationMin <= 80);
    } else if (selectedDuration === 'long') {
      list = list.filter((m) => m.durationMin > 80);
    }

    return list;
  }, [movies, debouncedSearch, fuse, activeCategory, selectedGenres, minRating, selectedDuration]);

  const toggleGenre = (genre) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handlePlayNow = (movie) => {
    if (!canControl) return;
    const cmdId = generateCmdId();
    socket.emit('playback:load', {
      cmdId,
      videoId: movie.id,
      videoUrl: movie.videoUrl,
      title: movie.title,
      clientId
    });
    if (onClose) onClose();
  };

  const handleAddToPlaylist = (movie) => {
    socket.emit('playlist:add', {
      videoId: movie.id,
      videoUrl: movie.videoUrl,
      title: movie.title
    });
  };

  return (
    <div
      id="syncwatch-discover-modal"
      className="glass-modal"
      style={{
        width: '92vw',
        maxWidth: '1100px',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 28px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>Movie Catalog</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Choose a movie or insert your own video
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onOpenCustomVideo && (
            <button
              onClick={onOpenCustomVideo}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 14px', borderColor: 'var(--accent-red)' }}
            >
              + Insert Video Link / File
            </button>
          )}
          {onClose && (
            <button
              id="close-discover-btn"
              onClick={onClose}
              className="btn-icon"
              style={{ width: 36, height: 36 }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}
            />
            <input
              id="movie-search-input"
              type="text"
              placeholder="Fuzzy search title, cast, tags (e.g. 'bug buck bunni')..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 42 }}
            />
          </div>

          {/* Duration Bucket */}
          <select
            id="duration-select-filter"
            value={selectedDuration}
            onChange={(e) => setSelectedDuration(e.target.value)}
            className="input-field"
            style={{ width: '160px', cursor: 'pointer' }}
          >
            <option value="all">All Durations</option>
            <option value="short">Short (≤ 20m)</option>
            <option value="medium">Medium (20-80m)</option>
            <option value="long">Feature (&gt; 80m)</option>
          </select>

          {/* Min Rating */}
          <select
            id="rating-select-filter"
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="input-field"
            style={{ width: '140px', cursor: 'pointer' }}
          >
            <option value={0}>Any Rating</option>
            <option value={7}>⭐ 7.0+ Rated</option>
            <option value={7.5}>⭐ 7.5+ Rated</option>
            <option value={8}>⭐ 8.0+ Rated</option>
          </select>
        </div>

        {/* Category Pills */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4
          }}
        >
          {allCategories.map((cat) => (
            <button
              key={cat}
              id={`category-pill-${cat}`}
              onClick={() => setActiveCategory(cat)}
              className={activeCategory === cat ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Genre Multi-select Pills */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            alignItems: 'center',
            fontSize: '0.8rem'
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginRight: 4 }}>
            Genres:
          </span>
          {allGenres.map((genre) => {
            const isSelected = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                id={`genre-pill-${genre}`}
                onClick={() => toggleGenre(genre)}
                style={{
                  background: isSelected ? 'rgba(220, 38, 38, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                  border: isSelected ? '1px solid var(--accent-red)' : '1px solid var(--border-subtle)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  borderRadius: '14px',
                  padding: '3px 10px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {genre}
              </button>
            );
          })}
          {selectedGenres.length > 0 && (
            <button
              onClick={() => setSelectedGenres([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                fontSize: '0.75rem',
                cursor: 'pointer',
                marginLeft: 4
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Movie Grid */}
      <div
        id="movie-grid-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: '20px'
        }}
      >
        {filteredMovies.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted)'
            }}
          >
            <p style={{ fontSize: '1.1rem', marginBottom: 8, color: '#fff' }}>No movies match your filters</p>
            <p style={{ fontSize: '0.85rem' }}>Try clearing the search query or adjusting genre filters</p>
          </div>
        ) : (
          filteredMovies.map((movie) => (
            <div
              key={movie.id}
              className="glass-panel"
              id={`movie-card-${movie.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
                backgroundColor: 'rgba(16, 4, 7, 0.9)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 10px 28px rgba(220, 38, 38, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-glass)';
              }}
            >
              {/* Poster Image */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '2/3',
                  backgroundColor: '#0c0f17',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={
                    movie.thumbnail ||
                    (movie.poster && !movie.poster.includes('wikimedia.org')
                      ? movie.poster
                      : movie.videoUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
                      ? `https://img.youtube.com/vi/${movie.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)[1]}/hqdefault.jpg`
                      : movie.poster)
                  }
                  alt={movie.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    const ytMatch =
                      movie.videoUrl &&
                      movie.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
                    if (ytMatch && ytMatch[1] && !e.currentTarget.src.includes(ytMatch[1])) {
                      e.currentTarget.src = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
                    } else {
                      e.currentTarget.src =
                        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80';
                    }
                  }}
                />

                {/* Rating Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(4px)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#ef4444'
                  }}
                >
                  <Star size={12} fill="#ef4444" />
                  {movie.rating}
                </div>

                {/* Duration Badge */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(4px)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.72rem',
                    color: '#e2e8f0'
                  }}
                >
                  <Clock size={11} />
                  {movie.durationMin}m
                </div>
              </div>

              {/* Movie Details */}
              <div
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      marginBottom: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={movie.title}
                  >
                    {movie.title}
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      marginBottom: 10
                    }}
                  >
                    <span>{movie.year}</span>
                    <span>•</span>
                    <span>{movie.genres?.slice(0, 2).join(', ')}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    id={`play-now-${movie.id}`}
                    onClick={() => handlePlayNow(movie)}
                    className="btn-primary"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '0.78rem',
                      justifyContent: 'center',
                      opacity: canControl ? 1 : 0.6
                    }}
                    disabled={!canControl}
                    title={canControl ? 'Play in room now' : 'Host-only mode'}
                  >
                    <Play size={13} fill="#fff" /> Play
                  </button>

                  <button
                    id={`add-playlist-${movie.id}`}
                    onClick={() => handleAddToPlaylist(movie)}
                    className="btn-secondary"
                    style={{ padding: '6px 10px' }}
                    title="Add to shared playlist"
                  >
                    <Plus size={14} />
                  </button>

                  {onCreatePollWithMovie && (
                    <button
                      id={`poll-movie-${movie.id}`}
                      onClick={() => onCreatePollWithMovie(movie)}
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Start a poll for this movie"
                    >
                      <Vote size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
