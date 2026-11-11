import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';

export function EntryPass({ token }: { token: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    const url = `${window.location.origin}/validar/${token}`;
    toDataURL(url, { margin: 1, width: 640, color: { dark: '#16356e', light: '#ffffff' } })
      .then((image) => {
        if (active) setSrc(image);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (!src) return null;

  return (
    <figure className="rsvp-qr">
      <img src={src} alt="Código para acreditar la entrada" />
      <figcaption>Mostralo en la entrada</figcaption>
    </figure>
  );
}
