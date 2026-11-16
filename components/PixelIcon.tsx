type IconName = 'book' | 'cap' | 'books' | 'calendar' | 'folder' | 'chart' | 'floppy' | 'house' | 'person' | 'help' | 'headphones' | 'document' | 'bubbles' | 'speaker' | 'menu' | 'chevron' | 'shield' | 'globe';

/** 16×16 pixel icons drawn in the repo. No outside images. */
const PIXELS: Record<IconName, string> = {
  book: 'M1 2h6v12H1zM2 4h4v1H2zM2 6h4v1H2zM2 8h4v1H2zM2 10h3v1H2zM9 2h6v12H9zM10 4h4v1h-4zM10 6h4v1h-4zM10 8h4v1h-4zM10 10h3v1h-4z',
  cap: 'M1 8h14v2H1zM3 6h10v2H3zM7 3h2v3H7zM2 10h3v2H2zm9 0h3v2h-3z',
  books: 'M1 3h4v10H1zm5 1h4v10H6zm5-2h4v11h-4zM2 5h2v1H2zm5 1h2v1H7zm5-1h2v1h-2z',
  calendar: 'M2 3h12v11H2zM2 3h12v3H2zM4 1h2v3H4zm6 0h2v3h-2zM4 8h2v2H4zm3 0h2v2H7zm3 0h2v2h-2z',
  folder: 'M1 4h6l1 2h7v8H1zM1 6h14v1H1z',
  chart: 'M2 13h12v1H2zM3 8h2v5H3zm3-3h2v8H6zm3 2h2v6H9zm3-4h2v10h-2z',
  floppy: 'M2 2h9l3 3v9H2zM4 2h5v4H4zM4 9h8v5H4z',
  house: 'M8 2l6 5v7H2V7zM6 9h4v5H6z',
  person: 'M6 2h4v4H6zM3 8h10v2H3zM4 10h3v4H4zm5 0h3v4H9z',
  help: 'M3 2h10v12H3zM6 5h4v1H8v2H7V6H6zM7 10h2v2H7z',
  globe: 'M6 1h4v1H6zM4 2h8v1H4zM3 3h10v1H3zM2 4h12v8H2zM7 4h2v8H7zM3 7h10v2H3zM3 12h10v1H3zM4 13h8v1H4zM6 14h4v1H6z',
  headphones: 'M4 2h8v2H4zM3 4h2v3H3zM11 4h2v3h-2zM2 7h4v6H2zM10 7h4v6h-4z',
  document: 'M3 1h10v14H3zM5 4h6v1H5zM5 7h6v1H5zM5 10h4v1H5z',
  bubbles: 'M1 2h7v4H5v1H4v1H3V6H1zM8 6h7v4h-2v1h-1v1h-1v-2H8z',
  speaker: 'M2 6h3v4H2zM5 4h2v8H5zM7 3h2v10H7zM11 5h1v6h-1zM13 3h1v10h-1z',
  menu: 'M2 3h12v2H2zM2 7h12v2H2zM2 11h12v2H2z',
  chevron: 'M5 3h2v2H5zM7 5h2v2H7zM9 7h2v2H9zM7 9h2v2H7zM5 11h2v2H5z',
  shield: 'M6 1h4v1H6zM4 2h8v1H4zM3 3h10v6H3zM4 9h8v1H4zM5 10h6v1H5zM6 11h4v1H6zM7 12h2v1H7z',
};

export function PixelIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges" className={`pixel-${name} shrink-0`}>
      <path fill="currentColor" fillRule="evenodd" d={PIXELS[name]} />
    </svg>
  );
}

export function menuPixelIcon(id: string) {
  if (id === 'lesson') return 'book' as const;
  if (id === 'grammar') return 'cap' as const;
  if (id === 'vocabulary') return 'books' as const;
  if (id === 'tasks') return 'calendar' as const;
  if (id === 'packs') return 'folder' as const;
  if (id === 'progress') return 'chart' as const;
  if (id === 'saved') return 'floppy' as const;
  if (id === 'academy') return 'house' as const;
  if (id === 'profile') return 'person' as const;
  return 'help' as const;
}
