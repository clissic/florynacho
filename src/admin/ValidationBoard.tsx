import { useEffect, useId, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Icon } from '../components/Icon';
import { formatDateTime } from '../lib/dates';
import { readEntryToken } from '../lib/entryToken';
import type { CheckInBoard, CheckInBreakdown, WeddingApi } from '../lib/models';

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

const PAGE_SIZE = 25;
const emptyBreakdown: CheckInBreakdown = { celiac: 0, vegetarian: 0, vegan: 0, other: 0, allergies: 0, children: 0 };

const miniCounters: { key: keyof CheckInBreakdown; label: string }[] = [
  { key: 'celiac', label: 'Celíacas' },
  { key: 'vegetarian', label: 'Vegetarianas' },
  { key: 'vegan', label: 'Veganas' },
  { key: 'other', label: 'Otra restricción' },
  { key: 'allergies', label: 'Alérgicas' },
  { key: 'children', label: 'Menores de 12' },
];

export function ValidationBoard({ api, pendingToken }: { api: WeddingApi; pendingToken: string }) {
  const [board, setBoard] = useState<CheckInBoard>({ total: 0, breakdown: emptyBreakdown, entries: [] });
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const helpTitle = useId();
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const busy = useRef(false);
  const seen = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  async function load() {
    const next = await api.listCheckIns();
    setBoard({ ...next, breakdown: next.breakdown ?? emptyBreakdown });
  }

  useEffect(() => {
    load().catch((reason: Error) => setNotice(reason.message));
  }, [api]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  async function accredit(token: string) {
    const now = Date.now();
    if (seen.current.token === token && now - seen.current.at < 4000) return;
    if (busy.current) return;
    seen.current = { token, at: now };
    busy.current = true;
    try {
      const result = await api.checkIn(token);
      setNotice(result.message);
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'No pudimos acreditar la entrada.');
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (pendingToken) void accredit(pendingToken);
  }, [pendingToken]);

  function stopCamera() {
    stopRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  function readFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    if (video.readyState < 2 || !video.videoWidth) return '';
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height)?.data ?? '';
  }

  async function startCamera() {
    setCameraError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('El navegador solo pide la cámara en una página segura. Abrí esta área desde esta computadora o con https.');
      return;
    }
    stopRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      video.classList.remove('is-off');
      await video.play();
      setScanning(true);
      const Detector = (window as Window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Detector) {
        try {
          detector = new Detector({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      const canvas = document.createElement('canvas');
      const tick = async () => {
        if (stopRef.current || !videoRef.current) return;
        let raw = '';
        if (detector) {
          try {
            const codes = await detector.detect(videoRef.current);
            raw = codes[0]?.rawValue ?? '';
          } catch {
            detector = null;
          }
        }
        if (!raw) raw = readFrame(videoRef.current, canvas);
        const token = raw ? readEntryToken(raw) : null;
        if (token) await accredit(token);
        if (!stopRef.current) timerRef.current = window.setTimeout(() => void tick(), 280);
      };
      void tick();
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      setCameraError(
        denied
          ? 'El navegador bloqueó la cámara. Permitila en el candado de la barra de direcciones y volvé a activarla.'
          : 'No pudimos usar la cámara. Revisá el permiso del navegador.',
      );
    }
  }

  const pages = Math.max(1, Math.ceil(board.entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visibleEntries = board.entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <section className="canvas-section">
      <header className="canvas-head">
        <div>
          <p className="eyebrow">Validación</p>
          <h2>La entrada</h2>
        </div>
        {scanning ? (
          <button type="button" className="btn btn-outline-primary button button-secondary" onClick={stopCamera}>
            Detener cámara
          </button>
        ) : (
          <button type="button" className="btn btn-primary button" onClick={() => void startCamera()}>
            <Icon name="qr_code_scanner" />
            Activar cámara
          </button>
        )}
      </header>
      <div className="validate-counts">
        <article className="stat validate-total">
          <strong>{board.total}</strong>
          <span>Personas acreditadas</span>
        </article>
        <div className="validate-mini">
          {miniCounters.map((item) => (
            <article className="stat" key={item.key}>
              <strong>{board.breakdown[item.key]}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      </div>
      <div className="validate-reader">
        <video ref={videoRef} className={scanning ? 'validate-video' : 'validate-video is-off'} muted playsInline />
        {cameraError || notice ? (
          <>
            {cameraError ? <p className="hint">{cameraError}</p> : null}
            {notice ? <p className="status" role="status">{notice}</p> : null}
          </>
        ) : null}
      </div>
      <div className="validate-log">
        <div className="validate-log-head">
          <h3>Entradas acreditadas</h3>
          <button type="button" className="canvas-info" aria-label="Qué muestra esta tabla" onClick={() => helpRef.current?.showModal()}>
            <Icon name="info" />
          </button>
        </div>
        <dialog ref={helpRef} className="rental-dialog csv-help" aria-labelledby={helpTitle}>
          <div className="rental-sheet">
            <button type="button" className="rental-close" aria-label="Cerrar" onClick={() => helpRef.current?.close()}>
              <Icon name="close" />
            </button>
            <p className="rental-kicker">Validación</p>
            <h2 id={helpTitle}>Entradas acreditadas</h2>
            <p>Cada fila es una invitación cuyo código ya se registró, con las personas que sumó.</p>
          </div>
        </dialog>
        {board.entries.length ? (
          <>
            <div className="table-scroll canvas-table">
              <table>
                <thead>
                  <tr>
                    <th>Invitado</th>
                    <th className="is-center">Personas</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => (
                    <tr key={`${entry.guestName}-${entry.accreditedAt}`}>
                      <td>{entry.guestName}</td>
                      <td className="is-center">{entry.count}</td>
                      <td>{formatDateTime(entry.accreditedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="canvas-pages">
              <button type="button" className="icon-action" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                <Icon name="arrow_back" />
              </button>
              <p>{board.entries.length} entradas · Página {currentPage} de {pages}</p>
              <button type="button" className="icon-action" aria-label="Página siguiente" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
                <Icon name="arrow_forward" />
              </button>
            </div>
          </>
        ) : (
          <p className="hint">Todavía no se acreditó ninguna entrada.</p>
        )}
      </div>
    </section>
  );
}
