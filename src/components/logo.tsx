import Image from "next/image";

export function Logo() {
  return <Image src="/logo.png" alt="POSSCOPE" width={192} height={56} priority />;
}
