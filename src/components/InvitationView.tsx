import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SiteContent } from '../content/defaultSite';
import type { PublicSite, InvitationData, SubmitResult } from '../lib/models';
import type { RsvpPayload } from '../lib/validation';
import { downloadIcs, googleCalendarUrl } from '../lib/calendar';
import { diffParts, formatEventDate, formatEventDay, formatEventMonth, formatEventTime } from '../lib/dates';
import { pauseMusic, startMusicFromGesture } from '../lib/player';
import { CopyButton } from './CopyButton';
import { Icon } from './Icon';
import { MusicPlayer } from './MusicPlayer';
import { RentalGuide } from './RentalGuide';
import { RsvpForm } from './RsvpForm';
import { Wave } from './Wave';


const STORY_PHOTOS = [
  'WhatsApp Image 2026-10-22 at 12.29.57 PM.jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.58 PM.jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.58 PM (1).jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.58 PM (2).jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.59 PM.jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.59 PM (1).jpeg',
  'WhatsApp Image 2026-10-22 at 12.29.59 PM (2).jpeg',
  'WhatsApp Image 2026-10-22 at 12.30.00 PM.jpeg',
].map((name) => ({
  src: `/fotos/${encodeURIComponent(name)}`,
  alt: 'Florencia e Ignacio',
}));

type Mode = 'home' | 'guest' | 'preview' | 'unavailable';

type Props = {
  site: PublicSite;
  mode: Mode;
  invitation?: InvitationData | null;
  entryToken?: string;
  onSubmit?: (payload: RsvpPayload) => Promise<SubmitResult>;
};

export function InvitationView({ site, mode, invitation = null, entryToken = '', onSubmit }: Props) {
  const content = site.content;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (entered) return;
    const html = document.documentElement;
    const previousHtml = html.style.overflow;
    const previousBody = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previousHtml;
      document.body.style.overflow = previousBody;
    };
  }, [entered]);

  function enter(withMusic: boolean) {
    sessionStorage.setItem('fi-player-paused', withMusic ? '0' : '1');
    if (withMusic) startMusicFromGesture();
    else pauseMusic();
    setEntered(true);
    window.scrollTo(0, 0);
  }

  return (
    <div className="page">
      {!entered ? (
        <div className="entry-gate" role="dialog" aria-modal="true" aria-label="Entrada a la invitación">
          <header className="cover">
            <CoverFrame content={content}>
              <div className="entry-actions">
                <button type="button" className="btn btn-primary button" onClick={() => enter(true)}>
                  <Icon name="volume_up" /> Ingresar con música
                </button>
                <button type="button" className="btn btn-primary button" onClick={() => enter(false)}>
                  <Icon name="volume_off" /> Ingresar sin música
                </button>
              </div>
            </CoverFrame>
          </header>
        </div>
      ) : null}
      <div className="invitation" {...(!entered ? { inert: true } : {})}>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      {mode === 'preview' ? <p className="preview-banner">Vista previa. Estos cambios todavía no están publicados.</p> : null}
      <header className="cover">
        <CoverFrame content={content}>
          <button type="button" className="btn btn-primary button" onClick={openInvitation}>
            <Icon name="mail" /> Abrir invitación
          </button>
        </CoverFrame>
      </header>
      <main id="contenido">
        {content.sections.story ? (
          <Reveal>
            <section className="band story-band is-centered" id="fotos" aria-labelledby="historia-titulo">
              <Wave name="a" />
              <div className="story-copy">
                <SectionMark icon="favorite" label="Nuestra historia" />
                <h2 id="historia-titulo">Así comenzó todo…</h2>
                <Gallery photos={STORY_PHOTOS} />
              </div>
            </section>
          </Reveal>
        ) : null}

        {content.sections.countdown ? (
          <Reveal>
            <Countdown target={content.eventDate} />
          </Reveal>
        ) : null}

        {content.sections.event ? (
          <Reveal>
            <section className="band event-band" aria-labelledby="evento-titulo">
              <Wave name="c" />
              <SectionMark icon="celebration" label="La celebración" />
              <h2 id="evento-titulo">{formatEventMonth(content.party.date)}</h2>
              <div className="celebration">
                <article className="celebration-side is-ceremony">
                  <h3>La ceremonia</h3>
                  <p className="fact">
                    <Icon name="schedule" />
                    <span>
                      {formatEventDay(content.ceremony.date)}
                      <small>{formatEventTime(content.ceremony.date)}</small>
                    </span>
                  </p>
                  <p className="fact">
                    <Icon name="location_on" />
                    <span>
                      {content.ceremony.place}
                      <small>{content.ceremony.city}</small>
                    </span>
                  </p>
                  <a className="celebration-map" href={content.ceremony.mapsUrl} target="_blank" rel="noreferrer">
                    <Icon name="directions" />
                    <span>Cómo llegar</span>
                  </a>
                </article>
                <img className="celebration-mark" src="/cover/delft-hortensias.png" alt="" />
                <article className="celebration-side is-party">
                  <h3>La fiesta</h3>
                  <p className="fact">
                    <Icon name="schedule" />
                    <span>
                      {formatEventDay(content.party.date)}
                      <small>{formatEventTime(content.party.date)}</small>
                    </span>
                  </p>
                  <p className="fact">
                    <Icon name="location_on" />
                    <span>
                      {content.party.place}
                      <small>{content.party.city}</small>
                    </span>
                  </p>
                  <a className="celebration-map" href={content.party.mapsUrl} target="_blank" rel="noreferrer">
                    <Icon name="directions" />
                    <span>Cómo llegar</span>
                  </a>
                </article>
              </div>
              <div className="action-stack">
                <a className="btn btn-outline-primary button button-secondary" href={googleCalendarUrl(content, 'ceremony')} target="_blank" rel="noreferrer">
                  <Icon name="calendar_add_on" />
                  <span>Agregar ceremonia</span>
                </a>
                <a className="btn btn-outline-primary button button-secondary" href={googleCalendarUrl(content, 'party')} target="_blank" rel="noreferrer">
                  <Icon name="calendar_add_on" />
                  <span>Agregar fiesta</span>
                </a>
                <button type="button" className="btn btn-outline-primary button button-secondary" onClick={() => downloadIcs(content)}>
                  <Icon name="download" />
                  <span>Descargar calendario</span>
                </button>
              </div>
            </section>
          </Reveal>
        ) : null}

        {content.sections.dressCode ? (
          <Reveal>
            <section className="band dress-band" aria-labelledby="vestimenta-titulo">
              <Wave name="d" />
              <div className="dress">
                <img className="dress-mark" src="/cover/delft-vestidor.png" alt="" />
                <div className="dress-copy">
                  <SectionMark icon="checkroom" label="Vestimenta" />
                  <h2 id="vestimenta-titulo">{content.dressCode.label}</h2>
                  <div className="dress-request">
                    <p>El blanco queda reservado para la novia y el azul marino para el novio.</p>
                  </div>
                  <RentalGuide />
                </div>
              </div>
            </section>
          </Reveal>
        ) : null}

        {content.sections.rsvp ? (
          <Reveal>
            <section className="band confirm" id="confirmar" aria-labelledby="confirmar-titulo">
              <Wave name="a" />
              <div className="container">
                <SectionMark icon="rsvp" label="Confirmación" />
                <h2 id="confirmar-titulo">{mode === 'guest' && invitation ? `¡Hola, ${invitation.givenName}!` : 'Tu respuesta'}</h2>
                {mode === 'guest' && invitation && onSubmit ? (
                  <RsvpForm
                    invitation={invitation}
                    entryToken={entryToken}
                    deadline={content.rsvpDeadline}
                    songsEnabled={content.sections.songs}
                    messagesEnabled={content.sections.messages}
                    onSubmit={onSubmit}
                  />
                ) : (
                  <>
                    <p className="lede">
                      {mode === 'unavailable'
                        ? 'Este enlace no está disponible. Si creés que es un error, escribinos.'
                        : mode === 'preview'
                          ? 'Cada invitado va a ver las preguntas que corresponden a su enlace. Desde la vista previa no se envían respuestas.'
                          : 'Para confirmar tu asistencia, abrí el enlace personal que te enviamos.'}
                    </p>
                    {mode === 'home' ? (
                      <img className="confirm-mark" src="/cover/delft-canasta.png" alt="" />
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </Reveal>
        ) : null}

        {content.sections.gifts ? (
          <Reveal>
            <section className="band gifts" id="regalos" aria-labelledby="regalos-titulo">
              <Wave name="b" />
              <SectionMark icon="redeem" label="Regalos" />
              <h2 id="regalos-titulo">Tu presencia es el regalo más importante</h2>
              <p>Si además querés hacernos un obsequio, podés colaborar con nuestra luna de miel.</p>
              <GiftAccounts accounts={content.gifts.accounts} />
            </section>
          </Reveal>
        ) : null}

        <Reveal>
          <section className="closing" aria-labelledby="cierre-titulo">
            <Wave name="d" />
            <SectionMark icon="favorite" label="Hasta pronto" />
            <h2 id="cierre-titulo">
              {content.couple.first} & {content.couple.second}
            </h2>
            <p>{content.closing}</p>
            <img className="closing-mark" src="/cover/delft-anillos.png" alt="" />
          </section>
        </Reveal>
      </main>
      <SiteFooter content={content} />
      <MusicPlayer
        src={`/audio/${encodeURIComponent('LOVE STORY (Taylor Swift) - Violin Cover by Alan Milan.mp3.mpeg')}`}
        title={content.musicTitle}
        concealed={!entered}
      />
      </div>
    </div>
  );
}

function CoverFrame({ content, children }: { content: SiteContent; children: ReactNode }) {
  return (
    <div className="delft-card">
      <img className="flora flora-left" src="/cover/delft-flora-der.png" alt="" />
      <img className="flora flora-right" src="/cover/delft-flora-der.png" alt="" />
      <img className="flora flora-top" src="/cover/delft-flora-arriba.png" alt="" />
      <img className="flora flora-bottom" src="/cover/delft-flora-abajo.png" alt="" />
      <img className="flora butterfly b1" src="/cover/delft-mariposa-1.png" alt="" />
      <img className="flora butterfly b2" src="/cover/delft-mariposa-2.png" alt="" />
      <img className="flora butterfly b3" src="/cover/delft-mariposa-3.png" alt="" />
      <div className="delft-inner">
        <p className="delft-kicker">¡Nos casamos!</p>
        <h1>
          <span>{content.couple.first}</span>
          <span className="amp">&amp;</span>
          <span>{content.couple.second}</span>
        </h1>
        <div className="delft-cast">
          <img className="cast-scene" src="/cover/delft-escena.png" alt="Florencia e Ignacio, con sus perros y sus gatos." />
        </div>
        <p className="delft-when">{formatEventDate(content.eventDate)}</p>
        {children}
      </div>
    </div>
  );
}

function SectionMark({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="section-mark">
      <Icon name={icon} />
      <p className="eyebrow">{label}</p>
    </div>
  );
}

function openInvitation() {
  startMusicFromGesture();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('contenido')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14 },
    );
    observer.observe(node);
    const fallback = window.setTimeout(() => setShown(true), 900);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);
  return (
    <div ref={ref} className={shown ? 'reveal is-visible' : 'reveal'}>
      {children}
    </div>
  );
}

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const parts = diffParts(target, now);
  const summary = parts.past
    ? 'La celebración ya comenzó.'
    : `${parts.days} días, ${parts.hours} horas, ${parts.minutes} minutos y ${parts.seconds} segundos.`;
  return (
    <section className="band countdown" aria-labelledby="cuenta-titulo">
      <Wave name="b" />
      <SectionMark icon="hourglass_empty" label="Falta" />
      <h2 id="cuenta-titulo">Hasta ese sábado</h2>
      {parts.past ? (
        <p className="lede">La celebración ya comenzó.</p>
      ) : (
        <div className="count-grid" aria-hidden="true">
          <Count value={parts.days} label="días" />
          <Count value={parts.hours} label="horas" />
          <Count value={parts.minutes} label="minutos" />
          <Count value={parts.seconds} label="segundos" />
        </div>
      )}
      <p className="visually-hidden">{summary}</p>
    </section>
  );
}

function SiteFooter({ content }: { content: SiteContent }) {
  const groups = [
    content.sections.event
      ? {
          title: 'La ceremonia',
          items: [
            <a key="ceremonia" href={content.ceremony.mapsUrl} target="_blank" rel="noreferrer">
              Cómo llegar
            </a>,
          ],
        }
      : null,
    content.sections.event
      ? {
          title: 'La fiesta',
          items: [
            <a key="fiesta" href={content.party.mapsUrl} target="_blank" rel="noreferrer">
              Cómo llegar
            </a>,
          ],
        }
      : null,
    content.sections.event
      ? {
          title: 'Calendario',
          items: [
            <a key="ceremonia" href={googleCalendarUrl(content, 'ceremony')} target="_blank" rel="noreferrer">
              Agregar ceremonia
            </a>,
            <a key="fiesta" href={googleCalendarUrl(content, 'party')} target="_blank" rel="noreferrer">
              Agregar fiesta
            </a>,
            <button key="ics" type="button" onClick={() => downloadIcs(content)}>
              Descargar calendario
            </button>,
          ],
        }
      : null,
    content.sections.dressCode
      ? { title: 'Vestimenta', items: [<RentalGuide key="alquiler" className="footer-link" />] }
      : null,
    content.sections.rsvp
      ? {
          title: 'Confirmación',
          items: [
            <a key="respuesta" href="#confirmar">
              Tu respuesta
            </a>,
          ],
        }
      : null,
    content.sections.gifts
      ? {
          title: 'Regalos',
          items: content.gifts.accounts.map((account) => (
            <a key={account.account} href="#regalos">
              {account.currency}
            </a>
          )),
        }
      : null,
    {
      title: 'Fotos',
      items: [
        <a key="historia" href="#fotos">
          Nuestra historia
        </a>,
      ],
    },
    {
      title: 'Administración',
      items: [
        <a key="gestion" href="/gestion">
          Gestión de invitados
        </a>,
      ],
    },
  ].filter((group) => group != null);

  if (groups.length === 0) return null;

  return (
    <footer className="site-footer">
      <Wave name="a" />
      <nav aria-label="Resumen">
        {groups.map((group) => (
          <div key={group.title}>
            <h2>{group.title}</h2>
            {group.items}
          </div>
        ))}
      </nav>
      <p className="footer-sign">
        {content.couple.first} & {content.couple.second}
      </p>
    </footer>
  );
}

function GiftAccounts({ accounts }: { accounts: SiteContent['gifts']['accounts'] }) {
  return (
    <div className="accounts">
      {accounts.map((account) => (
        <article className="account" key={`${account.holder}-${account.account}`}>
          <p className="eyebrow">
            <Icon name="account_balance" /> {account.bank}
          </p>
          <h3>{account.currency}</h3>
          <p className="holder">{account.holder}</p>
          <p className="account-number">{account.account}</p>
          <CopyButton value={account.account} label="Copiar cuenta" />
        </article>
      ))}
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  const previous = useRef(value);
  const [ticking, setTicking] = useState(false);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setTicking(true);
    const timer = window.setTimeout(() => setTicking(false), 320);
    return () => window.clearTimeout(timer);
  }, [value]);
  return (
    <div className={ticking ? 'count is-ticking' : 'count'}>
      <strong>{String(value).padStart(2, '0')}</strong>
      <span>{label}</span>
    </div>
  );
}

function Gallery({ photos }: { photos: { src: string; alt: string }[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const [actual, setActual] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  function show(photoIndex: number) {
    setActual(false);
    setIndex(photoIndex);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (index == null) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [index]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || index == null) return;
    if (!actual) {
      stage.scrollTo(0, 0);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      stage.scrollTo(
        Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2),
        Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actual, index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (index == null) return;
      if (event.key === 'ArrowRight') show((index + 1) % photos.length);
      if (event.key === 'ArrowLeft') show((index - 1 + photos.length) % photos.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length]);

  const current = index == null ? null : photos[index];

  return (
    <>
      <ul className="gallery">
        {photos.map((photo, photoIndex) => (
          <li key={photo.src}>
            <button type="button" onClick={() => show(photoIndex)}>
              <img src={photo.src} alt={photo.alt || 'Fotografía de Florencia e Ignacio'} loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialogRef}
        className="lightbox"
        onClose={() => setIndex(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        {current ? (
          <div
            className="lightbox-stage"
            ref={stageRef}
            onClick={(event) => {
              if (event.target === event.currentTarget) dialogRef.current?.close();
            }}
          >
            <img
              className={actual ? 'is-actual' : undefined}
              src={current.src}
              alt={current.alt || 'Fotografía ampliada'}
              onClick={() => setActual((value) => !value)}
            />
          </div>
        ) : null}
        <div className="lightbox-actions">
          <button type="button" className="btn btn-outline-primary button button-secondary" onClick={() => index != null && show((index - 1 + photos.length) % photos.length)}>
            <Icon name="arrow_back" /> Anterior
          </button>
          <button type="button" className="btn btn-primary button" onClick={() => dialogRef.current?.close()}>
            <Icon name="close" /> Cerrar
          </button>
          <button type="button" className="btn btn-outline-primary button button-secondary" onClick={() => index != null && show((index + 1) % photos.length)}>
            Siguiente <Icon name="arrow_forward" />
          </button>
        </div>
      </dialog>
    </>
  );
}
