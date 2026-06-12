export const DEFAULT_AVATARS = [
  "/avatars/키티.png",
  "/avatars/쿠로미.png",
  "/avatars/마이멜로디.png",
  "/avatars/폼폼푸린.png",
  "/avatars/시나모롤.png",
  "/avatars/포챠코.png",
];

export function randomDefaultAvatar() {
  return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
}
