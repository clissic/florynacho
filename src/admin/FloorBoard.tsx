import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  chairFacing,
  layoutChairs,
  nearestWall,
  newFloorId,
  openingEnds,
  planBounds,
  projectOnWall,
  seatKey,
  seatLayout,
  seatParty,
  snapPoint,
} from '../lib/floor';
import type { FloorChair, FloorObject, FloorOpening, FloorPlan, FloorSeatPerson, FloorShape, FloorTable, FloorWall } from '../lib/models';

type Tool = 'select' | 'wall' | 'door' | 'window' | 'bath' | 'dance' | 'stage' | 'table';
type Selection = { kind: 'table' | 'chair' | 'wall' | 'opening' | 'object'; id: string } | null;
type Camera = { x: number; y: number; scale: number };
type Kind = 'table' | 'chair' | 'wall' | 'object';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Seleccionar' },
  { id: 'wall', label: 'Pared' },
  { id: 'door', label: 'Puerta' },
  { id: 'window', label: 'Ventana' },
  { id: 'bath', label: 'Baño' },
  { id: 'dance', label: 'Pista' },
  { id: 'stage', label: 'Escenario' },
  { id: 'table', label: 'Mesa' },
];

export function FloorBoard({ people, plan, onChange }: { people: FloorSeatPerson[]; plan: FloorPlan; onChange: (plan: FloorPlan) => void }) {
  const planRef = useRef(plan);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 48, y: 36, scale: 1 });
  const historyRef = useRef<FloorPlan[]>([]);
  const draftRef = useRef<{ x: number; y: number }[]>([]);
  const selectedRef = useRef<Selection>(null);
  const [camera, setCamera] = useState<Camera>(cameraRef.current);
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<Selection>(null);
  const [draft, setDraft] = useState<{ x: number; y: number }[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [popover, setPopover] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [shape, setShape] = useState<FloorShape>('round');
  const [seatCount, setSeatCount] = useState(8);
  const [size, setSize] = useState({ width: 800, height: 560 });
  planRef.current = plan;
  draftRef.current = draft;
  cameraRef.current = camera;
  selectedRef.current = selected;

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const current = cameraRef.current;
      const nextScale = Math.min(2.8, Math.max(0.35, current.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      const worldX = (event.clientX - rect.left - current.x) / current.scale;
      const worldY = (event.clientY - rect.top - current.y) / current.scale;
      const next = {
        scale: nextScale,
        x: event.clientX - rect.left - worldX * nextScale,
        y: event.clientY - rect.top - worldY * nextScale,
      };
      cameraRef.current = next;
      setCamera(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  function toWorld(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect();
    const current = cameraRef.current;
    return {
      x: (event.clientX - (rect?.left ?? 0) - current.x) / current.scale,
      y: (event.clientY - (rect?.top ?? 0) - current.y) / current.scale,
    };
  }

  function commit(next: FloorPlan) {
    historyRef.current = [...historyRef.current.slice(-29), planRef.current];
    planRef.current = next;
    onChange(next);
  }

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    planRef.current = previous;
    onChange(previous);
    setNotice('');
  }

  function finishWall() {
    const points = draftRef.current;
    if (points.length < 2) return;
    const walls = [...planRef.current.walls];
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (Math.hypot(to.x - from.x, to.y - from.y) < 8) continue;
      walls.push({ id: newFloorId('pared'), x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
    if (walls.length !== planRef.current.walls.length) commit({ ...planRef.current, walls });
    setDraft([]);
    setCursor(null);
    setTool('select');
  }

  function removeSelected() {
    const current = selectedRef.current;
    if (!current) return;
    const source = planRef.current;
    if (current.kind === 'table') {
      commit({
        ...source,
        tables: source.tables.filter((item) => item.id !== current.id),
        chairs: source.chairs.filter((item) => item.tableId !== current.id),
      });
    } else if (current.kind === 'wall') {
      commit({
        ...source,
        walls: source.walls.filter((item) => item.id !== current.id),
        openings: source.openings.filter((item) => item.wallId !== current.id),
      });
    } else if (current.kind === 'opening') {
      commit({ ...source, openings: source.openings.filter((item) => item.id !== current.id) });
    } else if (current.kind === 'object') {
      commit({ ...source, objects: source.objects.filter((item) => item.id !== current.id) });
    } else {
      const chair = source.chairs.find((item) => item.id === current.id);
      if (!chair?.tableId) {
        commit({ ...source, chairs: source.chairs.filter((item) => item.id !== current.id) });
      } else {
        const remaining = source.chairs
          .filter((item) => item.tableId === chair.tableId && item.id !== chair.id)
          .sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0))
          .map((item, index) => ({ ...item, seatIndex: index }));
        commit(layoutChairs({
          ...source,
          tables: source.tables.map((item) => (item.id === chair.tableId ? { ...item, seats: remaining.length } : item)),
          chairs: [...source.chairs.filter((item) => item.tableId !== chair.tableId), ...remaining],
        }));
      }
    }
    setSelected(null);
    setPopover(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLElement && Boolean(event.target.closest('input, select, textarea'));
      if (event.code === 'Space' && !typing) event.preventDefault();
      if (typing) return;
      if (event.key === 'Escape') {
        setDraft([]);
        setSelected(null);
        setPopover(null);
        setAsking(false);
      }
      if (event.key === 'Enter') finishWall();
      if (event.key === 'Delete' || event.key === 'Backspace') removeSelected();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function track(startEvent: ReactPointerEvent, apply: (dx: number, dy: number, point: { x: number; y: number }) => void) {
    const point = toWorld(startEvent);
    const snapshot = structuredClone(planRef.current);
    let moved = false;
    function move(event: PointerEvent) {
      const next = toWorld(event);
      if (Math.hypot(event.clientX - startEvent.clientX, event.clientY - startEvent.clientY) > 4) moved = true;
      const dx = Math.round((next.x - point.x) / 16) * 16;
      const dy = Math.round((next.y - point.y) / 16) * 16;
      apply(dx, dy, next);
    }
    function stop() {
      if (moved) historyRef.current = [...historyRef.current.slice(-29), snapshot];
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function pan(event: ReactPointerEvent) {
    const origin = { x: event.clientX, y: event.clientY, camera: cameraRef.current };
    function move(pointer: PointerEvent) {
      const next = { ...origin.camera, x: origin.camera.x + pointer.clientX - origin.x, y: origin.camera.y + pointer.clientY - origin.y };
      cameraRef.current = next;
      setCamera(next);
    }
    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function dragKind(event: ReactPointerEvent, kind: Kind, id: string) {
    const source = planRef.current;
    const table = source.tables.find((item) => item.id === id);
    const chair = source.chairs.find((item) => item.id === id);
    const wall = source.walls.find((item) => item.id === id);
    const object = source.objects.find((item) => item.id === id);
    track(event, (dx, dy) => {
      const current = planRef.current;
      let next = current;
      if (kind === 'table' && table) next = layoutChairs({ ...current, tables: current.tables.map((item) => (item.id === id ? { ...item, x: table.x + dx, y: table.y + dy } : item)) });
      if (kind === 'chair' && chair) next = { ...current, chairs: current.chairs.map((item) => (item.id === id ? { ...item, x: chair.x + dx, y: chair.y + dy } : item)) };
      if (kind === 'wall' && wall) next = { ...current, walls: current.walls.map((item) => (item.id === id ? { ...item, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy } : item)) };
      if (kind === 'object' && object) next = { ...current, objects: current.objects.map((item) => (item.id === id ? { ...item, x: object.x + dx, y: object.y + dy } : item)) };
      planRef.current = next;
      onChange(next);
    });
  }

  function dragOpening(event: ReactPointerEvent, id: string) {
    const opening = planRef.current.openings.find((item) => item.id === id);
    const wall = planRef.current.walls.find((item) => item.id === opening?.wallId);
    if (!opening || !wall) return;
    track(event, (_dx, _dy, pointer) => {
      const hit = projectOnWall(wall, pointer.x, pointer.y);
      const half = opening.width / 2 / hit.length;
      const t = Math.min(1 - half - 0.02, Math.max(half + 0.02, hit.t));
      const next = { ...planRef.current, openings: planRef.current.openings.map((item) => (item.id === id ? { ...item, t } : item)) };
      planRef.current = next;
      onChange(next);
    });
  }

  function rotateFrom(kind: string, id: string) {
    const snapshot = structuredClone(planRef.current);
    let moved = false;
    function move(pointer: PointerEvent) {
      moved = true;
      const world = toWorld(pointer);
      const source = planRef.current;
      if (kind === 'table') {
        const table = source.tables.find((item) => item.id === id);
        if (!table) return;
        const angle = Math.round(((Math.atan2(world.y - table.y, world.x - table.x) * 180) / Math.PI + 90) / 15) * 15;
        const next = layoutChairs({ ...source, tables: source.tables.map((item) => (item.id === id ? { ...item, rotation: angle } : item)) });
        planRef.current = next;
        onChange(next);
      } else if (kind === 'object') {
        const object = source.objects.find((item) => item.id === id);
        if (!object) return;
        const angle = Math.round(((Math.atan2(world.y - object.y, world.x - object.x) * 180) / Math.PI + 90) / 15) * 15;
        const next = { ...source, objects: source.objects.map((item) => (item.id === id ? { ...item, rotation: angle } : item)) };
        planRef.current = next;
        onChange(next);
      } else {
        const chair = source.chairs.find((item) => item.id === id);
        if (!chair) return;
        const angle = Math.round(((Math.atan2(world.y - chair.y, world.x - chair.x) * 180) / Math.PI + 90) / 15) * 15;
        const natural = chairFacing(source, { ...chair, rotation: 0 });
        const next = { ...source, chairs: source.chairs.map((item) => (item.id === id ? { ...item, rotation: angle - natural } : item)) };
        planRef.current = next;
        onChange(next);
      }
    }
    function stop() {
      if (moved) historyRef.current = [...historyRef.current.slice(-29), snapshot];
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  function placeOpening(x: number, y: number, kind: 'door' | 'window') {
    const hit = nearestWall(planRef.current.walls, x, y, 18);
    if (!hit) {
      setNotice('Apoyá la abertura sobre una pared.');
      return;
    }
    const width = kind === 'door' ? 48 : 72;
    if (hit.length < width + 24) {
      setNotice('Esa pared es corta para la abertura.');
      return;
    }
    const half = width / 2 / hit.length;
    const opening: FloorOpening = {
      id: newFloorId(kind === 'door' ? 'puerta' : 'ventana'),
      wallId: hit.wall.id,
      kind,
      t: Math.min(1 - half - 0.02, Math.max(half + 0.02, hit.t)),
      width,
      flip: false,
    };
    commit({ ...planRef.current, openings: [...planRef.current.openings, opening] });
    setSelected({ kind: 'opening', id: opening.id });
    setTool('select');
    setNotice('');
  }

  function placeObject(x: number, y: number, kind: 'bath' | 'dance' | 'stage') {
    const object: FloorObject = {
      id: newFloorId(kind),
      kind,
      x,
      y,
      width: kind === 'bath' ? 52 : kind === 'dance' ? 180 : 200,
      height: kind === 'bath' ? 52 : kind === 'dance' ? 180 : 80,
      rotation: 0,
    };
    commit({ ...planRef.current, objects: [...planRef.current.objects, object] });
    setSelected({ kind: 'object', id: object.id });
    setTool('select');
    setNotice('');
  }

  function onBoardPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button === 1) {
      pan(event);
      return;
    }
    const world = toWorld(event);
    const last = draftRef.current.at(-1) ?? null;
    const snapped = snapPoint(world.x, world.y, planRef.current.walls, event.shiftKey ? last : null);
    if (tool === 'wall') {
      if (event.detail < 2) setDraft((points) => [...points, snapped]);
      return;
    }
    if (tool === 'door' || tool === 'window') {
      placeOpening(world.x, world.y, tool);
      return;
    }
    if (tool === 'bath' || tool === 'dance' || tool === 'stage') {
      placeObject(snapped.x, snapped.y, tool);
      return;
    }
    const node = (event.target as Element).closest('[data-kind]');
    const kind = node?.getAttribute('data-kind');
    const id = node?.getAttribute('data-id') ?? '';
    if (kind === 'rotate' && id) {
      event.stopPropagation();
      const target = node?.getAttribute('data-target') ?? 'table';
      setSelected({ kind: target === 'object' ? 'object' : target === 'chair' ? 'chair' : 'table', id });
      rotateFrom(target, id);
      return;
    }
    if ((kind === 'table' || kind === 'chair' || kind === 'wall' || kind === 'opening' || kind === 'object') && id) {
      event.stopPropagation();
      setSelected({ kind, id });
      setPopover(kind === 'chair' ? id : null);
      if (kind === 'chair') {
        const chair = planRef.current.chairs.find((item) => item.id === id);
        if (chair?.tableId) {
          dragKind(event, 'table', chair.tableId);
          return;
        }
      }
      if (kind === 'opening') {
        dragOpening(event, id);
        return;
      }
      dragKind(event, kind, id);
      return;
    }
    setSelected(null);
    setPopover(null);
    pan(event);
  }

  function addTable(event: FormEvent) {
    event.preventDefault();
    const seats = Math.min(20, Math.max(1, Math.round(seatCount)));
    const number = plan.tables.reduce((max, table) => Math.max(max, table.number), 0) + 1;
    const x = Math.round(((size.width / 2 - camera.x) / camera.scale) / 16) * 16;
    const y = Math.round(((size.height / 2 - camera.y) / camera.scale) / 16) * 16;
    const table: FloorTable = { id: newFloorId('mesa'), number, x, y, shape, seats, rotation: 0 };
    commit(layoutChairs({ ...plan, tables: [...plan.tables, table] }));
    setSelected({ kind: 'table', id: table.id });
    setAsking(false);
    setTool('select');
    setNotice('');
  }

  function fit() {
    const bounds = planBounds(plan);
    if (!bounds) {
      setCamera({ x: 48, y: 36, scale: 1 });
      return;
    }
    const worldW = Math.max(120, bounds.maxX - bounds.minX + 96);
    const worldH = Math.max(120, bounds.maxY - bounds.minY + 96);
    const scale = Math.min(2.2, Math.max(0.35, Math.min(size.width / worldW, size.height / worldH)));
    setCamera({
      scale,
      x: (size.width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale,
      y: (size.height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale,
    });
  }

  function assign(chair: FloorChair, value: string) {
    const person = people.find((item) => seatKey(item) === value) ?? null;
    const result = seatParty(plan, chair.id, person, people);
    commit(result.plan);
    setNotice(result.pending ? `No hay lugar en esta mesa para ${result.pending} ${result.pending === 1 ? 'persona' : 'personas'} del grupo.` : '');
    setPopover(chair.id);
  }

  function turn(delta: number) {
    if (!selected) return;
    if (selected.kind === 'table') {
      commit(layoutChairs({ ...plan, tables: plan.tables.map((item) => (item.id === selected.id ? { ...item, rotation: item.rotation + delta } : item)) }));
    } else if (selected.kind === 'object') {
      commit({ ...plan, objects: plan.objects.map((item) => (item.id === selected.id ? { ...item, rotation: item.rotation + delta } : item)) });
    } else if (selected.kind === 'chair') {
      commit({ ...plan, chairs: plan.chairs.map((item) => (item.id === selected.id ? { ...item, rotation: item.rotation + delta } : item)) });
    }
  }

  function resizeObject(object: FloorObject, width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 24 || height < 24) return;
    commit({ ...plan, objects: plan.objects.map((item) => (item.id === object.id ? { ...item, width, height } : item)) });
  }

  const seatedKeys = new Set(plan.chairs.map((chair) => seatKey(chair)).filter(Boolean));
  const missing = people.filter((person) => !seatedKeys.has(seatKey(person))).length;
  const activeTable = selected?.kind === 'table' ? plan.tables.find((item) => item.id === selected.id) ?? null : null;
  const activeChair = selected?.kind === 'chair' ? plan.chairs.find((item) => item.id === selected.id) ?? null : null;
  const activeWall = selected?.kind === 'wall' ? plan.walls.find((item) => item.id === selected.id) ?? null : null;
  const activeOpening = selected?.kind === 'opening' ? plan.openings.find((item) => item.id === selected.id) ?? null : null;
  const activeObject = selected?.kind === 'object' ? plan.objects.find((item) => item.id === selected.id) ?? null : null;
  const popoverChair = plan.chairs.find((item) => item.id === popover) ?? null;
  const left = -camera.x / camera.scale;
  const top = -camera.y / camera.scale;
  const right = left + size.width / camera.scale;
  const bottom = top + size.height / camera.scale;
  const step = camera.scale < 0.55 ? 48 : 24;
  const grid: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = Math.floor(left / step) * step; x <= right; x += step) grid.push({ x1: x, y1: top, x2: x, y2: bottom });
  for (let y = Math.floor(top / step) * step; y <= bottom; y += step) grid.push({ x1: left, y1: y, x2: right, y2: y });

  return (
    <div className="floor">
      <div className="floor-tools">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tool === item.id ? 'is-on' : ''}
            aria-pressed={tool === item.id}
            onClick={() => {
              setTool(item.id);
              setDraft([]);
              if (item.id === 'table') setAsking(true);
            }}
          >
            {item.label}
          </button>
        ))}
        <button type="button" onClick={undo}>Deshacer</button>
        <button type="button" onClick={fit}>Encuadrar</button>
        <button type="button" onClick={removeSelected} disabled={!selected}>Borrar</button>
      </div>
      {asking ? (
        <form className="floor-ask" onSubmit={addTable}>
          <label className="field">
            Forma
            <select value={shape} onChange={(event) => setShape(event.target.value as FloorShape)}>
              <option value="round">Redonda</option>
              <option value="square">Cuadrada</option>
              <option value="rect">Rectangular</option>
            </select>
          </label>
          <label className="field">
            Lugares
            <input type="number" min={1} max={20} value={seatCount} onChange={(event) => setSeatCount(Number(event.target.value))} required />
          </label>
          <button className="btn btn-primary button" type="submit">Agregar mesa</button>
          <button className="btn btn-outline-primary button button-secondary" type="button" onClick={() => { setAsking(false); setTool('select'); }}>Cancelar</button>
        </form>
      ) : null}
      <div className="floor-legend">
        <span><i className="is-free" /> Sin asignar</span>
        <span><i className="is-wait" /> Asignada, sin acreditar</span>
        <span><i className="is-in" /> Acreditada</span>
        <span>{missing} {missing === 1 ? 'confirmado' : 'confirmados'} sin silla</span>
      </div>
      <p className="hint">La rueda acerca hacia el puntero. Arrastrá el fondo para mover el plano. Con Shift la pared queda recta. Enter termina la pared.</p>
      <div className="floor-layout">
        <div className="floor-stage" ref={stageRef}>
          <svg className={tool === 'select' ? '' : 'is-drawing'} onPointerDown={onBoardPointerDown} onPointerMove={(event) => {
            if (tool !== 'wall') return;
            const world = toWorld(event);
            setCursor(snapPoint(world.x, world.y, plan.walls, event.shiftKey ? draft.at(-1) ?? null : null));
          }} onDoubleClick={(event) => {
            event.preventDefault();
            if (tool === 'wall') finishWall();
          }}>
            <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
              <rect className="floor-catch" x={left} y={top} width={Math.max(1, right - left)} height={Math.max(1, bottom - top)} />
              {grid.map((line) => <line key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`} className="floor-grid" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
              {plan.walls.map((wall) => <line key={wall.id} className={activeWall?.id === wall.id ? 'floor-wall is-selected' : 'floor-wall'} data-kind="wall" data-id={wall.id} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />)}
              {plan.openings.map((opening) => {
                const wall = plan.walls.find((item) => item.id === opening.wallId);
                if (!wall) return null;
                return <OpeningShape key={opening.id} wall={wall} opening={opening} selected={activeOpening?.id === opening.id} />;
              })}
              {plan.objects.map((object) => <VenueObject key={object.id} object={object} selected={activeObject?.id === object.id} />)}
              {plan.tables.map((table) => {
                const layout = seatLayout(table.shape, Math.max(table.seats, 1));
                const chosen = activeTable?.id === table.id;
                return (
                  <g key={table.id} transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}>
                    {table.shape === 'round'
                      ? <ellipse className={chosen ? 'floor-table is-selected' : 'floor-table'} data-kind="table" data-id={table.id} cx="0" cy="0" rx={layout.tableW / 2} ry={layout.tableH / 2} />
                      : <rect className={chosen ? 'floor-table is-selected' : 'floor-table'} data-kind="table" data-id={table.id} x={-layout.tableW / 2} y={-layout.tableH / 2} width={layout.tableW} height={layout.tableH} rx="8" />}
                    <text className="floor-number" data-kind="table" data-id={table.id} transform={`rotate(${-table.rotation})`}>{table.number}</text>
                    {chosen ? <circle className="floor-handle" data-kind="rotate" data-target="table" data-id={table.id} cx="0" cy={-layout.tableH / 2 - 18} r="6" /> : null}
                  </g>
                );
              })}
              {plan.chairs.map((chair) => {
                const person = people.find((item) => seatKey(item) === seatKey(chair));
                const tone = !chair.invitationId ? 'is-free' : person?.accredited ? 'is-in' : 'is-wait';
                return (
                  <g key={chair.id} transform={`translate(${chair.x} ${chair.y}) rotate(${chairFacing(plan, chair)})`}>
                    <circle className="floor-hit" data-kind="chair" data-id={chair.id} r="16" />
                    <rect className="floor-chair-back" data-kind="chair" data-id={chair.id} x="-7" y="-13" width="14" height="5" rx="1.5" />
                    <rect className={`floor-chair-seat ${tone} ${activeChair?.id === chair.id ? 'is-selected' : ''}`} data-kind="chair" data-id={chair.id} x="-8" y="-7" width="16" height="14" rx="3" />
                    {activeChair?.id === chair.id ? <circle className="floor-handle" data-kind="rotate" data-target="chair" data-id={chair.id} cx="0" cy="-22" r="5" /> : null}
                  </g>
                );
              })}
              {draft.length ? <polyline className="floor-draft" points={[...draft, ...(cursor ? [cursor] : [])].map((point) => `${point.x},${point.y}`).join(' ')} /> : null}
            </g>
          </svg>
          {popoverChair ? (
            <div className="floor-popover" style={{ left: camera.x + popoverChair.x * camera.scale, top: camera.y + popoverChair.y * camera.scale }}>
              <ChairCard chair={popoverChair} people={people} tables={plan.tables} />
            </div>
          ) : null}
        </div>
        <aside className="floor-detail">
          {activeTable ? (
            <>
              <h3>Mesa {activeTable.number}</h3>
              <label className="field">
                Número
                <input type="number" min={1} max={500} value={activeTable.number} onChange={(event) => {
                  const number = Number(event.target.value);
                  if (!Number.isInteger(number) || number < 1) return;
                  if (plan.tables.some((item) => item.id !== activeTable.id && item.number === number)) {
                    setNotice('Ese número de mesa ya está usado.');
                    return;
                  }
                  setNotice('');
                  commit({ ...plan, tables: plan.tables.map((item) => (item.id === activeTable.id ? { ...item, number } : item)) });
                }} />
              </label>
              <label className="field">
                Lugares
                <input type="number" min={1} max={20} value={activeTable.seats} onChange={(event) => {
                  const seats = Number(event.target.value);
                  if (!Number.isInteger(seats) || seats < 1 || seats > 20) return;
                  const assigned = plan.chairs.filter((chair) => chair.tableId === activeTable.id && chair.invitationId).length;
                  if (seats < assigned) {
                    setNotice('No se pueden quitar lugares que ya tienen una persona.');
                    return;
                  }
                  commit(layoutChairs({ ...plan, tables: plan.tables.map((item) => (item.id === activeTable.id ? { ...item, seats } : item)) }));
                }} />
              </label>
              <div className="floor-inline">
                <button type="button" onClick={() => turn(-15)}>Girar −15°</button>
                <button type="button" onClick={() => turn(15)}>Girar +15°</button>
              </div>
            </>
          ) : null}
          {activeChair ? (
            <>
              <h3>Silla</h3>
              <ChairCard chair={activeChair} people={people} tables={plan.tables} />
              <label className="field">
                Persona
                <select value={seatKey(activeChair)} onChange={(event) => assign(activeChair, event.target.value)}>
                  <option value="">Sin asignar</option>
                  {people.map((person) => <option key={seatKey(person)} value={seatKey(person)}>{personLabel(person)}</option>)}
                </select>
              </label>
              <div className="floor-inline">
                <button type="button" onClick={() => turn(-15)}>Girar −15°</button>
                <button type="button" onClick={() => turn(15)}>Girar +15°</button>
              </div>
            </>
          ) : null}
          {activeOpening ? (
            <>
              <h3>{activeOpening.kind === 'door' ? 'Puerta' : 'Ventana'}</h3>
              {activeOpening.kind === 'door' ? <button type="button" onClick={() => commit({ ...plan, openings: plan.openings.map((item) => (item.id === activeOpening.id ? { ...item, flip: !item.flip } : item)) })}>Cambiar el sentido</button> : null}
            </>
          ) : null}
          {activeObject ? (
            <>
              <h3>{objectName(activeObject.kind)}</h3>
              <label className="field">
                Ancho
                <input type="number" min={24} max={2000} value={Math.round(activeObject.width)} onChange={(event) => resizeObject(activeObject, Number(event.target.value), activeObject.height)} />
              </label>
              <label className="field">
                Alto
                <input type="number" min={24} max={2000} value={Math.round(activeObject.height)} onChange={(event) => resizeObject(activeObject, activeObject.width, Number(event.target.value))} />
              </label>
              <div className="floor-inline">
                <button type="button" onClick={() => turn(-15)}>Girar −15°</button>
                <button type="button" onClick={() => turn(15)}>Girar +15°</button>
              </div>
            </>
          ) : null}
          {activeWall ? <h3>Pared</h3> : null}
          {selected ? <button type="button" className="btn btn-link text-button" onClick={removeSelected}>Quitar del plano</button> : <p className="hint">Elegí un elemento para editarlo o borrarlo.</p>}
          {notice ? <p className="status" role="status">{notice}</p> : null}
        </aside>
      </div>
    </div>
  );
}

function personLabel(person: FloorSeatPerson) {
  if (person.role === 'companion') return `${person.label} (acompañante)`;
  if (person.role === 'child') return `${person.label} (menor)`;
  return person.label;
}

function roleName(role: FloorChair['role']) {
  if (role === 'companion') return 'Acompañante';
  if (role === 'child') return 'Menor';
  if (role === 'guest') return 'Titular';
  return 'Sin asignar';
}

function objectName(kind: FloorObject['kind']) {
  if (kind === 'dance') return 'Pista de baile';
  if (kind === 'stage') return 'Escenario';
  return 'Baño';
}

function ChairCard({ chair, people, tables }: { chair: FloorChair; people: FloorSeatPerson[]; tables: FloorTable[] }) {
  const person = people.find((item) => seatKey(item) === seatKey(chair));
  const table = tables.find((item) => item.id === chair.tableId);
  return (
    <div className="floor-card">
      <strong>{person?.label ?? 'Libre'}</strong>
      <p>{roleName(chair.role)}{table ? ` · Mesa ${table.number}` : ''}</p>
      {person ? <p>{person.accredited ? 'Ya acreditó con el QR.' : 'Todavía no acreditó.'}</p> : null}
    </div>
  );
}

function OpeningShape({ wall, opening, selected }: { wall: FloorWall; opening: FloorOpening; selected: boolean }) {
  const ends = openingEnds(wall, opening);
  const sign = opening.flip ? -1 : 1;
  const leaf = { x: ends.x1 + ends.nx * opening.width * sign, y: ends.y1 + ends.ny * opening.width * sign };
  return (
    <g className={selected ? 'floor-opening is-selected' : 'floor-opening'}>
      <line className="floor-cut" data-kind="opening" data-id={opening.id} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />
      {opening.kind === 'window' ? (
        <line className="floor-window" data-kind="opening" data-id={opening.id} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />
      ) : (
        <>
          <line className="floor-door" data-kind="opening" data-id={opening.id} x1={ends.x1} y1={ends.y1} x2={leaf.x} y2={leaf.y} />
          <path className="floor-swing" data-kind="opening" data-id={opening.id} d={`M ${ends.x2} ${ends.y2} A ${opening.width} ${opening.width} 0 0 ${sign > 0 ? 1 : 0} ${leaf.x} ${leaf.y}`} />
        </>
      )}
    </g>
  );
}

function VenueObject({ object, selected }: { object: FloorObject; selected: boolean }) {
  const label = object.kind === 'dance' ? 'Pista' : object.kind === 'stage' ? 'Escenario' : 'Baño';
  return (
    <g className={selected ? 'floor-object is-selected' : 'floor-object'} transform={`translate(${object.x} ${object.y}) rotate(${object.rotation})`}>
      <rect data-kind="object" data-id={object.id} x={-object.width / 2} y={-object.height / 2} width={object.width} height={object.height} rx={object.kind === 'bath' ? object.width / 2 : 8} />
      {object.kind === 'dance' ? <path data-kind="object" data-id={object.id} d={`M ${-object.width / 2} ${-object.height / 2} L ${object.width / 2} ${object.height / 2} M ${object.width / 2} ${-object.height / 2} L ${-object.width / 2} ${object.height / 2}`} /> : null}
      <text data-kind="object" data-id={object.id} transform={`rotate(${-object.rotation})`}>{label}</text>
      {selected ? <circle className="floor-handle" data-kind="rotate" data-target="object" data-id={object.id} cx="0" cy={-object.height / 2 - 16} r="6" /> : null}
    </g>
  );
}
