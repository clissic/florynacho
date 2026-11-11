import { useState } from 'react';
import { CopyButton } from '../components/CopyButton';
import { useApi } from '../lib/api';
import { downloadCsv, parseGuestCsv, toCsv } from '../lib/csv';
import { formatDateTime } from '../lib/dates';
import type { GuestRow } from '../lib/models';
import { dietaryLabel } from '../lib/stats';

export function GuestPanel({ guests, onChange }: { guests: GuestRow[]; onChange: () => Promise<void> }) {
  const api = useApi();
  const [editing, setEditing] = useState<GuestRow | null>(null);
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<1 | 2>(1);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [importNotes, setImportNotes] = useState<string[]>([]);

  function beginCreate() {
    setEditing(null);
    setName('');
    setSlots(1);
    setNotes('');
    setMessage('');
  }

  function beginEdit(guest: GuestRow) {
    setEditing(guest);
    setName(guest.guestName);
    setSlots(guest.slots);
    setNotes(guest.notes);
    setMessage('');
  }

  if (!api) return null;

  return (
    <section className="admin-section">
      <div className="section-head">
        <h2>{editing ? 'Editar invitación' : 'Nueva invitación'}</h2>
        <button type="button" className="btn btn-outline-primary button button-secondary" onClick={() => exportGuests(guests)}>
          Exportar CSV
        </button>
      </div>
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage('');
          try {
            await api.saveGuest(editing?.id ?? null, { name, slots, notes, status: editing?.status });
            beginCreate();
            setMessage('Guardamos la invitación.');
            await onChange();
          } catch (reason) {
            setMessage(reason instanceof Error ? reason.message : 'No pudimos guardar.');
          }
        }}
      >
        <label className="field">
          Nombre
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          Cupos
          <select value={slots} onChange={(event) => setSlots(Number(event.target.value) === 2 ? 2 : 1)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label className="field">
          Observaciones privadas
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </label>
        <div className="action-row">
          <button className="btn btn-primary button" type="submit">{editing ? 'Guardar cambios' : 'Crear invitación'}</button>
          {editing ? (
            <button className="btn btn-outline-primary button button-secondary" type="button" onClick={beginCreate}>
              Cancelar
            </button>
          ) : null}
        </div>
        <p className="status" role="status">{message}</p>
      </form>

      <label className="file-field">
        Importar CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const parsed = parseGuestCsv(await file.text());
            setImportNotes(parsed.errors);
            if (parsed.guests.length === 0) return;
            try {
              const result = await api.importGuests(parsed.guests);
              setImportNotes([`Se crearon ${result.created} invitaciones.`, ...parsed.errors]);
              await onChange();
            } catch (reason) {
              setImportNotes([reason instanceof Error ? reason.message : 'No pudimos importar.']);
            }
          }}
        />
      </label>
      <p className="hint">
        Columnas: nombre, apellido, cupos, observaciones. Hay un ejemplo en <a href="/invitados-ejemplo.csv">invitados-ejemplo.csv</a>.
      </p>
      {importNotes.map((note) => (
        <p key={note} className="hint">{note}</p>
      ))}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Cupos</th>
              <th>Estado</th>
              <th>Personas</th>
              <th>Acompañante</th>
              <th>Alimentación</th>
              <th>Fecha</th>
              <th>Enlace</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => {
              const link = `${window.location.origin}/i/${guest.token}`;
              const response = !guest.rsvp ? 'Pendiente' : guest.rsvp.attendance === 'no' ? 'No asiste' : 'Confirmó';
              return (
                <tr key={guest.id}>
                  <td data-label="Nombre">{guest.guestName}</td>
                  <td data-label="Cupos">{guest.slots}</td>
                  <td data-label="Estado">{guest.status === 'revoked' ? 'Desactivada' : response}</td>
                  <td data-label="Personas">{guest.rsvp?.confirmedCount ?? '—'}</td>
                  <td data-label="Acompañante">{guest.rsvp?.companionName || '—'}</td>
                  <td data-label="Alimentación">
                    {guest.rsvp && guest.rsvp.confirmedCount > 0
                      ? `${dietaryLabel(guest.rsvp.guestDietary, guest.rsvp.guestDietaryNote)}${guest.rsvp.guestAllergies ? ` · ${guest.rsvp.guestAllergies}` : ''}`
                      : '—'}
                    {guest.rsvp?.confirmedCount === 2
                      ? ` / ${dietaryLabel(guest.rsvp.companionDietary, guest.rsvp.companionDietaryNote)}${guest.rsvp.companionAllergies ? ` · ${guest.rsvp.companionAllergies}` : ''}`
                      : ''}
                  </td>
                  <td data-label="Fecha">{guest.rsvp ? formatDateTime(guest.rsvp.updatedAt) : '—'}</td>
                  <td data-label="Enlace">
                    <CopyButton value={link} label="Copiar enlace" className="btn btn-outline-primary button button-secondary" />
                  </td>
                  <td data-label="Observaciones">{guest.notes || '—'}</td>
                  <td data-label="Acciones">
                    <div className="action-row">
                      <button type="button" className="btn btn-outline-primary button button-secondary" onClick={() => beginEdit(guest)}>Editar</button>
                      <button
                        type="button"
                        className="btn btn-outline-primary button button-secondary"
                        onClick={async () => {
                          await api.setGuestStatus(guest.id, guest.status === 'active' ? 'revoked' : 'active');
                          await onChange();
                        }}
                      >
                        {guest.status === 'active' ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-link text-button"
                        onClick={async () => {
                          if (!window.confirm(`¿Eliminar la invitación de ${guest.guestName}?`)) return;
                          await api.deleteGuest(guest.id);
                          await onChange();
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function exportGuests(guests: GuestRow[]) {
  downloadCsv(
    'confirmaciones-florencia-ignacio.csv',
    toCsv(
      [
        'nombre',
        'cupos',
        'estado_invitacion',
        'confirmacion',
        'personas_confirmadas',
        'acompanante',
        'alimentacion',
        'alergias',
        'alimentacion_acompanante',
        'alergias_acompanante',
        'fecha_respuesta',
        'enlace',
        'observaciones',
      ],
      guests.map((guest) => [
        guest.guestName,
        guest.slots,
        guest.status === 'active' ? 'Activa' : 'Desactivada',
        !guest.rsvp ? 'Pendiente' : guest.rsvp.attendance === 'no' ? 'No asiste' : 'Confirmó',
        guest.rsvp?.confirmedCount ?? '',
        guest.rsvp?.companionName ?? '',
        dietaryLabel(guest.rsvp?.guestDietary ?? null, guest.rsvp?.guestDietaryNote),
        guest.rsvp?.guestAllergies ?? '',
        dietaryLabel(guest.rsvp?.companionDietary ?? null, guest.rsvp?.companionDietaryNote),
        guest.rsvp?.companionAllergies ?? '',
        guest.rsvp ? formatDateTime(guest.rsvp.updatedAt) : '',
        `${window.location.origin}/i/${guest.token}`,
        guest.notes,
      ]),
    ),
  );
}
