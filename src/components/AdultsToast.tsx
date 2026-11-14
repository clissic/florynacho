import { useState } from 'react';

export function AdultsToast() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3 invitation-toast-host" aria-live="polite" aria-atomic="true">
      <div className="toast show invitation-toast" role="status">
        <div className="toast-header">
          <strong className="me-auto">Una noche para disfrutar entre adultos</strong>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setOpen(false)} />
        </div>
        <div className="toast-body">
          <p>
            Queremos que todos puedan disfrutar de esta celebración y compartir una noche especial. Por eso, sugerimos que los más
            pequeños se queden en casa esta vez.
          </p>
          <p>
            Si por algún motivo necesitan asistir con niños, les pedimos especialmente que nos lo hagan saber con anticipación para
            poder contemplarlos en la organización y en el menú. Asimismo, les agradecemos el compromiso de acompañarlos y estar
            atentos a ellos durante toda la celebración, para que podamos disfrutar y compartir entre todos.
          </p>
          <p className="invitation-toast-thanks">¡Gracias por comprender y ayudarnos a que sea una noche inolvidable!</p>
        </div>
      </div>
    </div>
  );
}
