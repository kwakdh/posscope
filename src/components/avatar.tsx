type AvatarProps = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

const COLORS = [
  "#2196F3",
  "#F44336",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#009688",
];

function colorForName(name: string) {
  const sum = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return COLORS[sum % COLORS.length];
}

export function Avatar({ name, avatarUrl, size = 32, className = "" }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.4 };

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        style={style}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...style, backgroundColor: colorForName(name) }}
      className={`flex items-center justify-center rounded-full font-medium text-white ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
