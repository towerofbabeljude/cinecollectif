import React, { useState, useEffect } from 'react';
import { socket, clientId } from './lib/socket';
import Home from './pages/Home';
import Room from './pages/Room';

export default function App() {
  const [currentRoomCode, setCurrentRoomCode] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [userName, setUserName] = useState(() => localStorage.getItem('syncwatch_user_name') || 'Guest');
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch movie catalog
  useEffect(() => {
    fetch('/api/movies')
      .then((res) => res.json())
      .then((data) => {
        setMovies(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load movies from /api/movies:', err);
        setIsLoading(false);
      });
  }, []);

  // Handle URL path /r/:code or ?room=code on initial load and back/forward navigation
  useEffect(() => {
    const parseUrl = () => {
      const path = window.location.pathname;
      const search = new URLSearchParams(window.location.search);

      let code = null;
      if (path.startsWith('/r/')) {
        code = path.split('/r/')[1]?.split('/')[0]?.toUpperCase();
      } else if (search.get('room')) {
        code = search.get('room')?.toUpperCase();
      }

      if (code && code.length === 6) {
        joinRoomByCode(code);
      } else {
        setCurrentRoomCode(null);
      }
    };

    parseUrl();
    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  const joinRoomByCode = (code) => {
    const name = localStorage.getItem('syncwatch_user_name') || `Guest_${clientId.slice(0, 4)}`;
    socket.emit('room:join', { code, clientId, name }, (res) => {
      if (res && res.success) {
        setCurrentRoomCode(res.code);
        setSnapshot(res.snapshot);
      } else {
        console.warn('Could not join room from URL:', res?.error);
        window.history.pushState({}, '', '/');
        setCurrentRoomCode(null);
      }
    });
  };

  const handleJoinRoom = (code, name, initialSnapshot) => {
    setCurrentRoomCode(code);
    setSnapshot(initialSnapshot);
    setUserName(name);
    window.history.pushState({}, '', `/r/${code}`);
  };

  const handleLeaveRoom = () => {
    setCurrentRoomCode(null);
    setSnapshot(null);
    window.history.pushState({}, '', '/');
  };

  if (isLoading && movies.length === 0) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-darkest)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-heading)'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '3px solid rgba(220, 38, 38, 0.2)',
              borderTopColor: 'var(--accent-red)',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}
          />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Loading Ciné-Collectif Party Engine...</h2>
        </div>
      </div>
    );
  }

  return currentRoomCode ? (
    <Room
      roomCode={currentRoomCode}
      initialSnapshot={snapshot}
      userName={userName}
      onLeaveRoom={handleLeaveRoom}
      movies={movies}
    />
  ) : (
    <Home onJoinRoom={handleJoinRoom} movies={movies} />
  );
}
