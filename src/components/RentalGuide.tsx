import { useId, useRef, useState } from 'react';
import { Icon } from './Icon';

type Shop = {
  name: string;
  area: string;
  rating: string;
  reviews: number;
  maps: string;
};

type Place = 'montevideo' | 'costa';

function maps(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const PLACES: Record<Place, { trajes: Shop[]; vestidos: Shop[] }> = {
  montevideo: {
    trajes: [
      { name: 'Rent the Look MEN', area: 'Pocitos', rating: '5,0', reviews: 93, maps: maps('Rent the Look MEN Bv. España 2818 Montevideo') },
      { name: 'Electra', area: 'Bv. Artigas', rating: '4,8', reviews: 929, maps: maps('Electra Alquiler de Vestidos y Trajes Bv. Gral. Artigas 3713 Montevideo') },
      { name: 'F&S', area: 'Pocitos', rating: '4,7', reviews: 620, maps: maps('Alquiler de Trajes F&S Gabriel Pereira 3170 Montevideo') },
      { name: 'Mi Guardarropa', area: 'Centro', rating: '4,7', reviews: 57, maps: maps('Mi Guardarropa Plaza Independencia 828 Montevideo') },
      { name: 'Paso Molino', area: 'Paso Molino', rating: '4,7', reviews: 45, maps: maps('Alquiler de Trajes y Vestidos Paso Molino Santa Lucía 4361 Montevideo') },
    ],
    vestidos: [
      { name: 'AMES', area: 'Pocitos', rating: '5,0', reviews: 213, maps: maps('AMES Alquiler de vestidos 26 de Marzo 3282 Montevideo') },
      { name: 'Nina Correa', area: 'Malvín', rating: '5,0', reviews: 13, maps: maps('Nina Correa Alquiler de vestidos de fiesta Montevideo') },
      { name: 'BRISHA', area: 'Prado', rating: '4,9', reviews: 267, maps: maps('BRISHA alquiler de vestidos Av. Agraciada 4061 Montevideo') },
      { name: 'Today', area: 'Cordón', rating: '4,9', reviews: 173, maps: maps('Today Alquiler de vestidos de fiesta Brandzen 2003 bis Montevideo') },
      { name: 'La Rosaleda', area: 'Cordón', rating: '4,9', reviews: 80, maps: maps('La Rosaleda Dr. Tristán Narvaja 1585 Montevideo') },
    ],
  },
  costa: {
    trajes: [
      { name: 'Elite', area: 'Buschental', rating: '5,0', reviews: 288, maps: maps('Alquiler de trajes Elite Buschental Ciudad de la Costa') },
      { name: 'BARRETO TRAJES', area: 'Solymar', rating: '5,0', reviews: 41, maps: maps('BARRETO TRAJES Rambla Costanera Solymar') },
      { name: 'Trajes y vestidos de fiesta', area: 'Las Candelas', rating: '4,8', reviews: 31, maps: maps('Alquiler de trajes y vestidos de fiesta De Las Candelas Ciudad de la Costa') },
      { name: 'La Casa de los Novios', area: 'Rambla', rating: '4,7', reviews: 53, maps: maps('Alquiler de trajes Rambla Tomás Berreta Ciudad de la Costa') },
      { name: 'Fantástica', area: 'Lagomar', rating: '4,6', reviews: 78, maps: maps('Fantástica alquiler de vestidos y trajes Avenida Racine Ciudad de la Costa') },
    ],
    vestidos: [
      { name: 'Allure', area: 'El Pinar', rating: '5,0', reviews: 100, maps: maps('Alquiler de Vestidos de Fiesta Allure Congreso El Pinar') },
      { name: 'Candelaria', area: 'Paso de Carrasco', rating: '5,0', reviews: 4, maps: maps('Candelaria vestidos San Pancracio Ciudad de la Costa') },
      { name: 'Lili', area: 'Solymar', rating: '4,9', reviews: 24, maps: maps('Lili alquiler de vestidos Olmos Solymar') },
      { name: 'Serata', area: 'Lagomar', rating: '4,9', reviews: 18, maps: maps('Serata alquiler de vestidos Ciudad de la Costa') },
      { name: 'Caim', area: 'El Pinar', rating: '4,7', reviews: 20, maps: maps('Alquiler de Vestidos Caim El Pinar Ciudad de la Costa') },
    ],
  },
};

export function RentalGuide({ className = 'dress-help' }: { className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [place, setPlace] = useState<Place>('montevideo');
  const current = PLACES[place];

  return (
    <>
      <button type="button" className={className} onClick={() => dialogRef.current?.showModal()}>
        Alquiler de vestidos y trajes
      </button>
      <dialog ref={dialogRef} className="rental-dialog" aria-labelledby={titleId}>
        <div className="rental-sheet">
          <button type="button" className="rental-close" onClick={() => dialogRef.current?.close()} aria-label="Cerrar">
            <Icon name="close" />
          </button>
          <p className="rental-kicker">Una ayuda para los invitados</p>
          <h2 id={titleId}>Dónde alquilar</h2>
          <div className="rental-tabs" role="tablist" aria-label="Zona">
            {([
              ['montevideo', 'Montevideo'],
              ['costa', 'Ciudad de la Costa'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={place === id}
                className={place === id ? 'is-on' : ''}
                onClick={() => setPlace(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rental-columns">
            <ShopList title="Trajes" shops={current.trajes} />
            <ShopList title="Vestidos" shops={current.vestidos} />
          </div>
          <p className="rental-note">Ordenados por las reseñas públicas de Google. Conviene confirmar horario y disponibilidad.</p>
        </div>
      </dialog>
    </>
  );
}

function ShopList({ title, shops }: { title: string; shops: Shop[] }) {
  return (
    <section>
      <h3>{title}</h3>
      <ol>
        {shops.map((shop) => (
          <li key={shop.name}>
            <strong>{shop.name}</strong>
            <span>
              {shop.area} · {shop.rating} · {shop.reviews} {shop.reviews === 1 ? 'opinión' : 'opiniones'}
            </span>
            <a href={shop.maps} target="_blank" rel="noreferrer">
              Ver en el mapa
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
