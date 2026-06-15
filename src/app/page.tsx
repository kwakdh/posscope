import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@/lib/supabase/middleware";
import { SignOutButton } from "@/components/sign-out-button";
import { ProfileAvatar } from "@/components/profile-avatar";
import { OnlineUsers } from "@/components/online-users";
import { ProductTabs } from "@/components/product-tabs";
import { Logo } from "@/components/logo";

const PRODUCT_ORDER = ["pos-app", "berrypos", "partner"];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("name, role, avatar_url")
    .eq("id", user!.id)
    .single();

  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "") || profile?.role === "admin";

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, feature_categories(id, name, sort_order, features(id, name, status, sort_order))")
    .order("slug");

  const productsData = (products ?? [])
    .slice()
    .sort((a, b) => PRODUCT_ORDER.indexOf(a.slug) - PRODUCT_ORDER.indexOf(b.slug))
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      categories: (product.feature_categories ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((category) => ({
          id: category.id,
          name: category.name,
          features: (category.features ?? [])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((feature) => ({
              id: feature.id,
              name: feature.name,
              status: feature.status as "draft" | "in_review" | "deployed",
            })),
        })),
    }));

  return (
    <div className="flex flex-1 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-zinc-200/60 bg-[#EDEDED] px-6 py-1">
        <Logo />
        <div className="flex items-center gap-4 text-sm text-ink-muted">
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
          <span className="font-semibold text-ink">{profile?.name ?? user?.email}</span>
          {isAdmin && (
            <Link href="/admin/users" className="font-semibold text-brand">
              사용자 관리
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      <ProductTabs products={productsData} currentUserName={profile?.name ?? user!.email ?? ""} />
    </div>
  );
}
