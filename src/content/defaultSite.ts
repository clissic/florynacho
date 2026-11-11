function mapsQuery(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export type Dietary = 'none' | 'celiac' | 'vegetarian' | 'vegan' | 'other';
export type Attendance = 'yes_one' | 'yes_two' | 'no';
export type InvitationStatus = 'active' | 'revoked';

export type BankAccount = {
  bank: string;
  currency: string;
  holder: string;
  account: string;
};

export type SiteSections = {
  story: boolean;
  gallery: boolean;
  countdown: boolean;
  event: boolean;
  dressCode: boolean;
  rsvp: boolean;
  songs: boolean;
  messages: boolean;
  gifts: boolean;
};

export type Gathering = {
  date: string;
  place: string;
  city: string;
  mapsUrl: string;
};

export type SiteContent = {
  couple: { first: string; second: string };
  eventDate: string;
  rsvpDeadline: string;
  timezone: 'America/Montevideo';
  venue: { name: string; city: string; mapsUrl: string };
  ceremony: Gathering;
  party: Gathering;
  dressCode: { label: string; women: string; men: string };
  story: string;
  sections: SiteSections;
  gifts: { intro: string; accounts: BankAccount[] };
  closing: string;
  coverImagePath: string | null;
  musicPath: string | null;
  musicTitle: string;
  gallery: { path: string; alt: string }[];
};

export const defaultSite: SiteContent = {
  couple: { first: 'Florencia', second: 'Ignacio' },
  eventDate: '2026-12-19T20:00:00-03:00',
  rsvpDeadline: '2026-11-19',
  timezone: 'America/Montevideo',
  venue: {
    name: 'Parque Policial Solymar',
    city: 'Ciudad de la Costa',
    mapsUrl: mapsQuery('James Summer 141, 15800 Ciudad de la Costa, Departamento de Canelones'),
  },
  ceremony: {
    date: '2026-12-18T10:45:00-03:00',
    place: 'Registro Civil',
    city: 'Ciudad de la Costa',
    mapsUrl: mapsQuery('52FM+C48, 15800 Ciudad de la Costa, Departamento de Canelones'),
  },
  party: {
    date: '2026-12-19T20:00:00-03:00',
    place: 'Parque Policial Solymar',
    city: 'Ciudad de la Costa',
    mapsUrl: mapsQuery('James Summer 141, 15800 Ciudad de la Costa, Departamento de Canelones'),
  },
  dressCode: {
    label: 'Formal',
    women: 'El blanco queda reservado para la novia.',
    men: 'El azul marino queda reservado para el novio.',
  },
  story:
    'Hay historias que empiezan despacio y después se vuelven casa. La nuestra tiene tardes compartidas, un border collie que nos sigue a todas partes y dos gatos que pretenden que la casa es de ellos.\n\nEl 19 de diciembre queremos celebrar este amor con ustedes.',
  sections: {
    story: true,
    gallery: true,
    countdown: true,
    event: true,
    dressCode: true,
    rsvp: true,
    songs: true,
    messages: true,
    gifts: true,
  },
  gifts: {
    intro:
      'Si además querés hacernos un obsequio, podés colaborar con nuestra luna de miel.',
    accounts: [
      {
        bank: 'Banco BROU',
        currency: 'Pesos uruguayos',
        holder: 'Florencia López',
        account: '110450471-00001',
      },
      {
        bank: 'Banco BROU',
        currency: 'Dólares estadounidenses',
        holder: 'Ignacio La Cava',
        account: '001743207-00002',
      },
    ],
  },
  closing: 'Gracias por acompañarnos en este momento. Nos hace felices compartir este día con ustedes.',
  coverImagePath: null,
  musicPath: null,
  musicTitle: 'Música de la invitación',
  gallery: [],
};

export const DEMO_TOKENS = {
  ana: '7c1a9e4b2d8f46a0b5c3e1d79a28f604',
  martin: '3e8b0c5d7a1f49e2c6b4d8a0f15e3c97',
  lucia: '9a4f2e7c1b8d40e6a5c3f0d28b71e4a6',
  diego: '1f6c8a3e5b0d47c9e2a4f7b1c8d05e36',
  camila: '8b0e4d1a6c3f49e7b2a5d8c1f0e64a73',
  elena: '5d2a9c7e4b1f48a0c6e3d5b8a7f14c20',
} as const;

export const DIETARY_OPTIONS: { value: Dietary; label: string }[] = [
  { value: 'none', label: 'Sin restricciones' },
  { value: 'celiac', label: 'Celíaco/a — sin gluten' },
  { value: 'vegetarian', label: 'Vegetariano/a' },
  { value: 'vegan', label: 'Vegano/a' },
  { value: 'other', label: 'Otra restricción' },
];

export const MAX_GALLERY = 24;
export const MAX_SONGS = 5;
