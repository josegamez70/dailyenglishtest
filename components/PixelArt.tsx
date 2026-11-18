/** A menu or practice icon. The picture stays in colour when the button is selected. */
export function PixelArt({ src, size = 24 }: { src: string; size?: number }) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="pixel-art inline-block shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
