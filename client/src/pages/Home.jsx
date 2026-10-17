import React, { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import {
  Film,
  Sparkles,
  Users,
  Play,
  ArrowRight,
  Plus,
  Tv,
  Upload,
  Star,
  Search,
  Filter,
  Clock,
  X
} from 'lucide-react';
import { socket, clientId } from '../lib/socket';
import CustomVideoModal from '../components/CustomVideoModal';

export function getMovieThumbnail(movie) {
  if (!movie) return '';
  if (movie.thumbnail) return movie.thumbnail;
  if (movie.poster && !movie.poster.includes('wikimedia.org')) return movie.poster;
  if (movie.videoUrl) {
    const ytMatch = movie.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
    }
  }
  return movie.poster || '';
}

const DEFAULT_MOVIES = [
  {
    id: 'bbb',
    title: 'Big Buck Bunny',
    year: 2008,
    genres: ['Animation', 'Comedy', 'Family'],
    categories: ['Open Movies', 'Trending', 'Family'],
    rating: 7.4,
    durationMin: 10,
    cast: ['Jan Morgenstern', 'Sacha Goedegebure'],
    tags: ['bunny', 'forest', 'funny', 'blender', 'short'],
    videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    poster: 'https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    description: 'A large and lovable rabbit deals with three bullying rodents in this classic Blender Foundation open movie.'
  },
  {
    id: 'sintel',
    title: 'Sintel',
    year: 2010,
    genres: ['Animation', 'Fantasy', 'Adventure'],
    categories: ['Open Movies', 'Featured', 'Fantasy'],
    rating: 7.6,
    durationMin: 15,
    cast: ['Halina Reijn', 'Thom Hoffman'],
    tags: ['dragon', 'journey', 'warrior', 'blender', 'emotional'],
    videoUrl: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
    poster: 'https://img.youtube.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    description: 'A girl searches the world for a baby dragon she befriended. A moving epic by the Blender Foundation.'
  },
  {
    id: 'tos',
    title: 'Tears of Steel',
    year: 2012,
    genres: ['Sci-Fi', 'Action', 'Drama'],
    categories: ['Open Movies', 'Trending', 'Sci-Fi'],
    rating: 6.8,
    durationMin: 12,
    cast: ['Derek de Lint', 'Sergio Hasselbaink', 'Rogier Schippers'],
    tags: ['cyberpunk', 'robots', 'amsterdam', 'dystopian', 'vfx'],
    videoUrl: 'https://www.youtube.com/watch?v=R6MlUcmOul8',
    poster: 'https://img.youtube.com/vi/R6MlUcmOul8/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/R6MlUcmOul8/hqdefault.jpg',
    description: 'Warriors fight a city-threatening robot army in the Netherlands, in this Blender VFX showcase film.'
  },
  {
    id: 'ed',
    title: 'Elephants Dream',
    year: 2006,
    genres: ['Animation', 'Sci-Fi'],
    categories: ['Open Movies', 'Sci-Fi'],
    rating: 6.9,
    durationMin: 11,
    cast: ['Tygo Gernandt', 'Cas Jansen'],
    tags: ['machine', 'surreal', 'blender', 'steampunk', 'pioneer'],
    videoUrl: 'https://www.youtube.com/watch?v=TLkA0RELQ1g',
    poster: 'https://img.youtube.com/vi/TLkA0RELQ1g/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/TLkA0RELQ1g/hqdefault.jpg',
    description: "The world's first open movie — a surreal steampunk journey inside a mechanical fantasy world."
  },
  {
    id: 'cl',
    title: 'Cosmos Laundromat',
    year: 2015,
    genres: ['Animation', 'Drama', 'Fantasy'],
    categories: ['Open Movies', 'Featured'],
    rating: 7.7,
    durationMin: 12,
    cast: ['Pierre Bokma', 'Reinout Scholten van Aschat'],
    tags: ['sheep', 'island', 'paradise', 'philosophical', 'blender'],
    videoUrl: 'https://www.youtube.com/watch?v=Y-rmzh0PI3c',
    poster: 'https://img.youtube.com/vi/Y-rmzh0PI3c/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/Y-rmzh0PI3c/hqdefault.jpg',
    description: 'On a desolate island, a suicidal sheep finds himself in the hands of a mysterious entity offering a second chance.'
  },
  {
    id: 'sf',
    title: 'Sprite Fright',
    year: 2021,
    genres: ['Animation', 'Comedy', 'Horror'],
    categories: ['Open Movies', 'Comedy', 'Trending'],
    rating: 7.5,
    durationMin: 10,
    cast: ['Colin McFarlane'],
    tags: ['80s', 'monsters', 'forest', 'dark comedy', 'teens'],
    videoUrl: 'https://www.youtube.com/watch?v=_cMxraX_5RE',
    poster: 'https://img.youtube.com/vi/_cMxraX_5RE/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/_cMxraX_5RE/hqdefault.jpg',
    description: 'A group of 80s teenagers venture into an enchanted forest, only to meet tiny but deadly mushroom monsters.'
  },
  {
    id: 'spring',
    title: 'Spring',
    year: 2019,
    genres: ['Animation', 'Fantasy'],
    categories: ['Open Movies', 'Trending', 'Family'],
    rating: 7.8,
    durationMin: 8,
    cast: ['Blender Studio'],
    tags: ['nature', 'spirits', 'mountains', 'seasons', 'blender'],
    videoUrl: 'https://www.youtube.com/watch?v=WhWc3b3KhnY',
    poster: 'https://img.youtube.com/vi/WhWc3b3KhnY/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/WhWc3b3KhnY/hqdefault.jpg',
    description: 'A young deer awakes in the mountains and tries to find her place in a world filled with magical creatures.'
  },
  {
    id: 'hero',
    title: 'Hero',
    year: 2018,
    genres: ['Animation', 'Action'],
    categories: ['Open Movies', 'Trending'],
    rating: 7.2,
    durationMin: 1,
    cast: ['Blender Studio'],
    tags: ['grease pencil', 'action', 'short', 'superhero', 'blender'],
    videoUrl: 'https://www.youtube.com/watch?v=pKmSdY56VtY',
    poster: 'https://img.youtube.com/vi/pKmSdY56VtY/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/pKmSdY56VtY/hqdefault.jpg',
    description: 'A Blender Grease Pencil 2D animation superhero showcase.'
  },
  {
    id: 'caminandes-3',
    title: 'Caminandes 3: Llamigos',
    year: 2016,
    genres: ['Animation', 'Comedy', 'Family'],
    categories: ['Open Movies', 'Family', 'Comedy'],
    rating: 7.6,
    durationMin: 3,
    cast: ['Pablo Vazquez'],
    tags: ['llama', 'penguin', 'winter', 'snow', 'friendship'],
    videoUrl: 'https://www.youtube.com/watch?v=SkVqJ1SGeL0',
    poster: 'https://img.youtube.com/vi/SkVqJ1SGeL0/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/SkVqJ1SGeL0/hqdefault.jpg',
    description: 'Koro the llama and a little penguin make an unlikely friendship in the Patagonian winter.'
  },
  {
    id: 'nosferatu',
    title: 'Nosferatu',
    year: 1922,
    genres: ['Horror', 'Fantasy'],
    categories: ['Public Domain Classics', 'Horror'],
    rating: 7.9,
    durationMin: 94,
    cast: ['Max Schreck', 'Gustav von Wangenheim', 'Greta Schröder'],
    tags: ['vampire', 'dracula', 'expressionism', 'shadows', 'silent'],
    videoUrl: 'https://www.youtube.com/watch?v=FC6jFoYm3xs',
    poster: 'https://img.youtube.com/vi/FC6jFoYm3xs/hqdefault.jpg',
    thumbnail: 'https://img.youtube.com/vi/FC6jFoYm3xs/hqdefault.jpg',
    description: "F.W. Murnau's legendary 1922 expressionist horror film — the original vampire movie with the iconic Count Orlok."
  }
];

function MovieCard({ movie, onWatch }) {
  const [hovered, setHovered] = useState(false);
  const [imgSrc, setImgSrc] = useState(() => getMovieThumbnail(movie));

  useEffect(() => {
    setImgSrc(getMovieThumbnail(movie));
  }, [movie]);

  const hrs = Math.floor(movie.durationMin / 60);
  const mins = movie.durationMin % 60;
  const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onWatch(movie)}
      style={{
        position: 'relative',
        borderRadius: '14px',
        overflow: 'hidden',
        cursor: 'pointer',
        aspectRatio: '2/3',
        background: '#0a0a0a',
        border: hovered ? '1.5px solid rgba(239,68,68,0.7)' : '1.5px solid rgba(255,255,255,0.07)',
        boxShadow: hovered ? '0 0 24px rgba(239,68,68,0.3)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-4px) scale(1.02)' : 'none',
        flexShrink: 0
      }}
    >
      <img
        src={imgSrc}
        alt={movie.title}
        loading="lazy"
        onError={() => {
          if (movie.videoUrl) {
            const ytMatch = movie.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
            if (ytMatch && ytMatch[1] && imgSrc !== `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`) {
              setImgSrc(`https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`);
              return;
            }
          }
          setImgSrc('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80');
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transition: 'opacity 0.2s',
          opacity: hovered ? 0.45 : 1
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '36px 12px 12px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
          transition: 'opacity 0.2s',
          opacity: hovered ? 0 : 1
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
          {movie.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Star size={11} color="#f59e0b" fill="#f59e0b" />
          <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>{movie.rating}</span>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>• {movie.year} • {durStr}</span>
        </div>
      </div>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            gap: 10
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 28px rgba(239,68,68,0.7)',
              flexShrink: 0
            }}
          >
            <Play size={22} fill="#fff" color="#fff" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {movie.title}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {movie.genres.slice(0, 2).map((g) => (
                <span
                  key={g}
                  style={{
                    fontSize: '0.65rem',
                    background: 'rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid rgba(239,68,68,0.4)'
                  }}
                >
                  {g}
                </span>
              ))}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4, maxWidth: '150px', margin: '0 auto' }}>
              {movie.description}
            </p>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{movie.year} • {durStr}</div>
        </div>
      )}
    </div>
  );
}

export default function Home({ onJoinRoom, movies = [] }) {
  const [userName, setUserName] = useState(() => localStorage.getItem('syncwatch_user_name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showCustomVideoModal, setShowCustomVideoModal] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedDuration, setSelectedDuration] = useState('all');
  const [minRating, setMinRating] = useState(0);

  // Debounce search input by 150ms as specified in Section 7.2
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const effectiveMovies = useMemo(() => {
    return movies && movies.length > 0 ? movies : DEFAULT_MOVIES;
  }, [movies]);

  // Extract unique categories & genres
  const categories = useMemo(() => {
    const set = new Set(['All']);
    effectiveMovies.forEach((m) => m.categories?.forEach((c) => set.add(c)));
    return Array.from(set);
  }, [effectiveMovies]);

  const genres = useMemo(() => {
    const set = new Set(['All']);
    effectiveMovies.forEach((m) => m.genres?.forEach((g) => set.add(g)));
    return Array.from(set);
  }, [effectiveMovies]);

  // Fuse.js fuzzy search configured with spec weights & threshold (0.35)
  const fuse = useMemo(() => {
    return new Fuse(effectiveMovies, {
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
  }, [effectiveMovies]);

  // Combined filters: Fuzzy Search + Category + Genre + Rating + Duration
  const filteredMovies = useMemo(() => {
    let list = effectiveMovies;

    if (debouncedSearch.trim()) {
      const results = fuse.search(debouncedSearch.trim());
      list = results.map((r) => r.item);
    }

    if (selectedCategory !== 'All') {
      list = list.filter((m) => m.categories && m.categories.includes(selectedCategory));
    }

    if (selectedGenre !== 'All') {
      list = list.filter((m) => m.genres && m.genres.includes(selectedGenre));
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
  }, [effectiveMovies, debouncedSearch, fuse, selectedCategory, selectedGenre, minRating, selectedDuration]);

  useEffect(() => {
    if (userName) {
      localStorage.setItem('syncwatch_user_name', userName);
    }
  }, [userName]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    const effectiveName = userName.trim() || 'Host';
    setIsCreating(true);
    setErrorMsg('');

    const trimmedUrl = videoUrlInput.trim();

    socket.emit(
      'room:create',
      {
        name: effectiveName,
        clientId,
        initialVideoId: trimmedUrl ? `custom_${Date.now()}` : null,
        initialVideoUrl: trimmedUrl || null,
        initialTitle: trimmedUrl ? 'Watch Party Stream' : null
      },
      (res) => {
        setIsCreating(false);
        if (res && res.success) {
          onJoinRoom(res.code, effectiveName, res.snapshot);
        } else {
          setErrorMsg(res?.error || 'Failed to create room. Please try again.');
        }
      }
    );
  };

  const handleJoinByCode = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const effectiveName = userName.trim() || `Guest_${clientId.slice(0, 4)}`;

    socket.emit(
      'room:join',
      {
        code,
        clientId,
        name: effectiveName
      },
      (res) => {
        if (res && res.success) {
          onJoinRoom(res.code, effectiveName, res.snapshot);
        } else {
          setErrorMsg(res?.error || 'Could not join room. Check the code.');
        }
      }
    );
  };

  const handleCustomVideoCreated = ({ videoUrl, title }) => {
    const effectiveName = userName.trim() || 'Host';
    socket.emit(
      'room:create',
      {
        name: effectiveName,
        clientId,
        initialVideoId: `custom_${Date.now()}`,
        initialVideoUrl: videoUrl,
        initialTitle: title
      },
      (res) => {
        if (res && res.success) {
          onJoinRoom(res.code, effectiveName, res.snapshot);
        }
      }
    );
  };

  const handleWatchMovie = (movie) => {
    const effectiveName = userName.trim() || 'Host';
    socket.emit(
      'room:create',
      {
        name: effectiveName,
        clientId,
        initialVideoId: movie.id,
        initialVideoUrl: movie.videoUrl,
        initialTitle: movie.title
      },
      (res) => {
        if (res && res.success) {
          onJoinRoom(res.code, effectiveName, res.snapshot);
        } else {
          setErrorMsg(res?.error || 'Failed to create room.');
        }
      }
    );
  };

  return (
    <div
      id="syncwatch-home-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 24px',
        maxWidth: '1240px',
        margin: '0 auto',
        backgroundColor: '#000000'
      }}
    >
      {/* Navigation Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '50px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)'
            }}
          >
            <Tv size={22} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff' }}>
              Ciné-<span style={{ color: '#ef4444' }}>Collectif</span>
            </h1>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Watch Parties Together
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowCustomVideoModal(true)}
          className="btn-secondary"
          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ffffff' }}
        >
          <Plus size={15} color="#ef4444" /> Insert Video / File
        </button>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1 }}>
        <div
          style={{
            textAlign: 'center',
            maxWidth: '820px',
            margin: '0 auto 46px'
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 16,
              color: '#ffffff'
            }}
          >
            Watch Together, <span style={{ color: '#ef4444' }}>In Sync.</span>
          </h2>
          <p
            style={{
              fontSize: '1.15rem',
              color: '#e2e8f0',
              lineHeight: 1.6,
              maxWidth: '620px',
              margin: '0 auto'
            }}
          >
            Watch movies or stream your own video files together with friends. Synchronized playback, shared playlist, live chat, and reactions.
          </p>
        </div>

        {/* Action Cards (Create / Join) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
            maxWidth: '920px',
            margin: '0 auto 50px'
          }}
        >
          {/* Create Party Card */}
          <div className="glass-panel" style={{ padding: '28px', backgroundColor: 'rgba(18, 4, 7, 0.9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  background: 'rgba(220, 38, 38, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444'
                }}
              >
                <Sparkles size={18} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>Host a Party</h3>
            </div>

            <form onSubmit={handleCreateRoom} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#e2e8f0', marginBottom: 6 }}>
                  Your Display Name
                </label>
                <input
                  id="create-room-name-input"
                  type="text"
                  placeholder="e.g. Alex"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                    Video Link (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCustomVideoModal(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Upload size={12} /> Upload File
                  </button>
                </div>
                <input
                  id="create-room-video-input"
                  type="url"
                  placeholder="Paste YouTube link or MP4 URL..."
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  className="input-field"
                />
              </div>

              <button
                id="create-room-submit-btn"
                type="submit"
                disabled={isCreating}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
              >
                <Play size={16} fill="#fff" /> {isCreating ? 'Creating Party...' : 'Create Watch Party'}
              </button>
            </form>
          </div>

          {/* Join Party Card */}
          <div className="glass-panel" style={{ padding: '28px', backgroundColor: 'rgba(18, 4, 7, 0.9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  background: 'rgba(220, 38, 38, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444'
                }}
              >
                <Users size={18} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>Join a Party</h3>
            </div>

            <form onSubmit={handleJoinByCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#e2e8f0', marginBottom: 6 }}>
                  Your Display Name
                </label>
                <input
                  id="join-room-name-input"
                  type="text"
                  placeholder="e.g. Jordan"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#e2e8f0', marginBottom: 6 }}>
                  6-Character Room Code
                </label>
                <input
                  id="join-room-code-input"
                  type="text"
                  placeholder="e.g. ABC123"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="input-field mono"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}
                  required
                />
              </div>

              <button
                id="join-room-submit-btn"
                type="submit"
                className="btn-secondary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginTop: 6,
                  borderColor: 'rgba(239, 68, 68, 0.5)'
                }}
              >
                <ArrowRight size={16} /> Enter Room
              </button>
            </form>
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              maxWidth: '500px',
              margin: '0 auto 30px',
              padding: '12px 18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(220, 38, 38, 0.2)',
              border: '1px solid var(--accent-red)',
              color: '#fca5a5',
              textAlign: 'center',
              fontSize: '0.9rem'
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Movie Discovery & Catalog Section */}
        <div style={{ marginTop: '50px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em' }}>
                <Film size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: '#ef4444' }} />
                Movie Discovery & Catalog
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Fuzzy search, categories, and filters — click any title to start a synchronized watch party
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
              {filteredMovies.length} title{filteredMovies.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {/* Search & Filter Controls */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'rgba(18, 4, 7, 0.85)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginBottom: 24
            }}
          >
            {/* Top row: Fuzzy search bar + Duration filter + Rating filter */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8'
                  }}
                />
                <input
                  id="home-movie-search-input"
                  type="text"
                  placeholder="Fuzzy search title, cast, tags (e.g. 'bug buck bunni')..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: 38, fontSize: '0.85rem' }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Duration filter */}
              <select
                id="home-duration-select"
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value)}
                className="input-field"
                style={{ width: '150px', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                <option value="all">All Durations</option>
                <option value="short">Short (≤ 20m)</option>
                <option value="medium">Medium (20-80m)</option>
                <option value="long">Feature (&gt; 80m)</option>
              </select>

              {/* Min rating */}
              <select
                id="home-rating-select"
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="input-field"
                style={{ width: '130px', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                <option value={0}>Any Rating</option>
                <option value={7}>⭐ 7.0+ Rated</option>
                <option value={7.5}>⭐ 7.5+ Rated</option>
                <option value={8}>⭐ 8.0+ Rated</option>
              </select>
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Genre Pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: 4 }}>Genre:</span>
              {genres.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGenre(g)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    borderRadius: '999px',
                    border: selectedGenre === g ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                    background: selectedGenre === g ? 'rgba(239,68,68,0.2)' : 'transparent',
                    color: selectedGenre === g ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Movie Grid */}
          {filteredMovies.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                backgroundColor: 'rgba(18, 4, 7, 0.5)',
                borderRadius: '12px',
                border: '1px dashed var(--border-subtle)',
                color: '#94a3b8'
              }}
            >
              <Film size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>No titles matched your filters</p>
              <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Try clearing your search term or selecting "All" categories.</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All');
                  setSelectedGenre('All');
                  setSelectedDuration('all');
                  setMinRating(0);
                }}
                className="btn-secondary"
                style={{ marginTop: 12, fontSize: '0.75rem' }}
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div
              id="movie-catalog-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '16px'
              }}
            >
              {filteredMovies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} onWatch={handleWatchMovie} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Custom Video / Upload Modal */}
      {showCustomVideoModal && (
        <CustomVideoModal
          onClose={() => setShowCustomVideoModal(false)}
          canControl={true}
          onVideoLoaded={handleCustomVideoCreated}
        />
      )}
    </div>
  );
}
