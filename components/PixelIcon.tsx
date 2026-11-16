type IconName = 'book' | 'cap' | 'books' | 'calendar' | 'folder' | 'chart' | 'floppy' | 'house' | 'person' | 'help' | 'headphones' | 'document' | 'bubbles' | 'speaker' | 'menu' | 'chevron' | 'shield';

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

type Dot = readonly [number, number, number, number, string];

/** 32×32 coloured menu icons. Drawn here, not loaded from outside. */
const MENU_PIXELS: Record<IconName, readonly Dot[]> = {
  book: [
    [1, 8, 14, 20, '#1d4ed8'], [17, 8, 14, 20, '#1e40af'], [14, 8, 4, 20, '#1e3a8a'],
    [3, 10, 10, 16, '#fff'], [19, 10, 10, 16, '#fff'],
    [4, 13, 8, 2, '#93c5fd'], [4, 17, 8, 2, '#93c5fd'], [4, 21, 6, 2, '#93c5fd'],
    [20, 13, 8, 2, '#93c5fd'], [20, 17, 8, 2, '#93c5fd'], [20, 21, 6, 2, '#93c5fd'],
  ],
  cap: [
    [2, 13, 28, 5, '#111827'], [8, 6, 16, 8, '#111827'], [14, 3, 4, 4, '#111827'],
    [15, 8, 3, 3, '#fbbf24'], [22, 16, 3, 8, '#fbbf24'], [18, 23, 8, 3, '#fbbf24'],
  ],
  books: [
    [3, 8, 22, 6, '#dc2626'], [5, 9, 18, 4, '#fecaca'],
    [6, 15, 22, 6, '#16a34a'], [8, 16, 18, 4, '#bbf7d0'],
    [4, 22, 24, 6, '#1d4ed8'], [6, 23, 20, 4, '#bfdbfe'],
  ],
  calendar: [
    [6, 7, 20, 22, '#fff'], [6, 7, 20, 7, '#dc2626'],
    [9, 3, 3, 6, '#111827'], [20, 3, 3, 6, '#111827'],
    [9, 17, 3, 3, '#111827'], [14, 17, 3, 3, '#111827'], [19, 17, 3, 3, '#111827'],
    [9, 22, 3, 3, '#2563eb'], [14, 22, 3, 3, '#2563eb'],
  ],
  folder: [
    [4, 8, 12, 6, '#eab308'], [4, 12, 24, 14, '#facc15'], [6, 14, 20, 2, '#fde047'],
  ],
  chart: [
    [4, 26, 24, 2, '#111827'],
    [6, 16, 4, 10, '#2563eb'], [12, 10, 4, 16, '#16a34a'], [18, 14, 4, 12, '#dc2626'], [24, 6, 4, 20, '#f59e0b'],
  ],
  floppy: [
    [6, 4, 20, 24, '#374151'], [8, 4, 12, 8, '#e5e7eb'], [10, 6, 6, 4, '#9ca3af'],
    [8, 16, 16, 9, '#2563eb'], [10, 18, 12, 2, '#fff'], [10, 21, 8, 2, '#fff'],
  ],
  house: [
    [14, 3, 4, 4, '#dc2626'], [10, 7, 12, 4, '#dc2626'], [6, 11, 20, 4, '#dc2626'],
    [8, 15, 16, 13, '#fde047'], [13, 20, 6, 8, '#1d4ed8'],
    [10, 17, 4, 4, '#fff'], [18, 17, 4, 4, '#fff'],
  ],
  person: [
    [12, 3, 8, 8, '#60a5fa'], [14, 5, 4, 4, '#dbeafe'],
    [8, 13, 16, 6, '#2563eb'], [11, 19, 4, 9, '#1d4ed8'], [17, 19, 4, 9, '#1d4ed8'],
  ],
  help: [
    [4, 4, 24, 24, '#7c3aed'],
    [10, 8, 12, 4, '#fff'], [18, 12, 4, 4, '#fff'], [14, 16, 4, 4, '#fff'], [14, 22, 4, 4, '#fff'],
  ],
  headphones: [], document: [], bubbles: [], speaker: [], menu: [], chevron: [], shield: [],
};

/** Coloured 32×32 menu icon for Retro 95. Other themes do not use it. */
export function MenuPixelIcon({ name }: { name: IconName }) {
  const dots = MENU_PIXELS[name];
  if (!dots.length) return <PixelIcon name={name} size={32} />;
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} aria-hidden="true" shapeRendering="crispEdges" className="shrink-0">
      {dots.map(([x, y, w, h, fill], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </svg>
  );
}
