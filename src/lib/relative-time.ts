export function formatRelativeTime(isoDate: string | null | undefined): string {
  if (!isoDate) return "접속 기록 없음";

  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / (60 * 1000));

  if (minutes < 1) return "방금 전 접속";
  if (minutes < 60) return `${minutes}분 전 접속`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 접속`;

  const days = Math.floor(hours / 24);
  return `${days}일 전 접속`;
}
