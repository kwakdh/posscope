import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@/lib/supabase/middleware";
import { SignOutButton } from "@/components/sign-out-button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { OnlineUsers } from "@/components/online-users";

const TABS = [
  { slug: "pos-app", label: "포스앱" },
  { slug: "berrypos", label: "베리포스" },
  { slug: "partner", label: "파트너" },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, avatar_url")
    .eq("id", user!.id)
    .single();

  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "") || profile?.role === "admin";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <Image src="/logo-wordmark.svg" alt="POSSCOPE" width={225} height={45} priority />
        <div className="flex items-center gap-4 text-sm text-zinc-600">
          <OnlineUsers
            userId={user!.id}
            name={profile?.name ?? user!.email ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
          />
          <ProfileAvatar
            userId={user!.id}
            name={profile?.name ?? user!.email ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
          />
          <span>{profile?.name ?? user?.email}</span>
          {isAdmin && (
            <Link href="/admin/users" className="font-medium text-zinc-900 underline">
              사용자 관리
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      <nav className="flex gap-1 border-b border-zinc-200 bg-white px-6">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex flex-1 items-center justify-center text-zinc-400">
        기능 메뉴 리스트가 여기에 표시됩니다.
      </main>
    </div>
  );
}
