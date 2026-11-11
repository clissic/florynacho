import { useEffect, useRef, useState } from 'react';
import { bindAudio } from '../lib/player';
import { Icon } from './Icon';

type Props = {
  src: string | null;
  title: string;
  concealed?: boolean;
};

export function MusicPlayer({ src, title, concealed = false }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    bindAudio(audio);
    const time = Number(sessionStorage.getItem('fi-player-time') || '0');
    audio.volume = 0.85;
    if (Number.isFinite(time) && time > 0) audio.currentTime = time;

    const onPlay = () => {
      setPlaying(true);
      sessionStorage.setItem('fi-player-paused', '0');
    };
    const onPause = () => {
      setPlaying(false);
      sessionStorage.setItem('fi-player-paused', '1');
      sessionStorage.setItem('fi-player-time', String(audio.currentTime));
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    const timer = window.setInterval(() => {
      if (!audio.paused) sessionStorage.setItem('fi-player-time', String(audio.currentTime));
    }, 1000);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      window.clearInterval(timer);
      bindAudio(null);
    };
  }, [src]);

  if (!src) return null;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  return (
    <div className={concealed ? 'player is-concealed' : 'player'}>
      <audio ref={audioRef} src={src} loop preload="auto" />
      <button
        type="button"
        className="player-button"
        onClick={togglePlay}
        aria-pressed={playing}
        aria-label={playing ? `Apagar ${title}` : `Prender ${title}`}
      >
        <Icon name={playing ? 'volume_up' : 'volume_off'} />
      </button>
    </div>
  );
}
