"use client";

import { useState } from "react";

type Feature = {
  id: string;
  name: string;
  status: "draft" | "in_review" | "deployed";
};

type Category = {
  id: string;
  name: string;
  features: Feature[];
};

type ProductData = {
  slug: string;
  name: string;
  categories: Category[];
};

type ProductTabsProps = {
  products: ProductData[];
};

type SidebarItem = {
  id: string;
  name: string;
  status: Feature["status"] | null;
};

const STATUS_LABEL: Record<Feature["status"], string> = {
  draft: "초안",
  in_review: "검토중",
  deployed: "배포완료",
};

const STATUS_STYLE: Record<Feature["status"], string> = {
  draft: "bg-zinc-100 text-zinc-500",
  in_review: "bg-amber-50 text-amber-600",
  deployed: "bg-emerald-50 text-emerald-600",
};

// 하위 기능 목록 없이 카테고리 자체를 메뉴 항목으로 노출
const FLAT_CATEGORY_NAMES = new Set(["상품", "테이블", "주문 현황"]);

function buildSidebarItems(categories: Category[]): SidebarItem[] {
  return categories.flatMap((category) => {
    if (FLAT_CATEGORY_NAMES.has(category.name)) {
      return [{ id: category.id, name: category.name, status: null }];
    }
    return category.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      status: feature.status,
    }));
  });
}

export function ProductTabs({ products }: ProductTabsProps) {
  const [activeSlug, setActiveSlug] = useState(products[0]?.slug ?? "");
  const active = products.find((p) => p.slug === activeSlug);

  const sidebarItems = active ? buildSidebarItems(active.categories) : [];
  const [selectedId, setSelectedId] = useState<string | null>(sidebarItems[0]?.id ?? null);
  const selected = sidebarItems.find((item) => item.id === selectedId) ?? sidebarItems[0] ?? null;

  function handleSelectProduct(slug: string) {
    setActiveSlug(slug);
    const items = buildSidebarItems(products.find((p) => p.slug === slug)?.categories ?? []);
    setSelectedId(items[0]?.id ?? null);
  }

  return (
    <>
      <nav className="flex gap-1 border-b border-zinc-200 bg-white px-6">
        {products.map((product) => (
          <button
            key={product.slug}
            onClick={() => handleSelectProduct(product.slug)}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              product.slug === activeSlug
                ? "border-brand text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
            }`}
          >
            {product.name}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {sidebarItems.length === 0 ? (
          <main className="flex flex-1 items-center justify-center text-zinc-400">
            아직 등록된 기능 메뉴가 없습니다.
          </main>
        ) : (
          <>
            <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white py-3">
              <div className="px-3 py-1 text-xs font-semibold text-zinc-400">
                📁 {active?.name}
              </div>
              <ul className="mt-1">
                {sidebarItems.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setSelectedId(item.id)}
                      className={`flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm ${
                        item.id === selected?.id
                          ? "bg-brand/10 font-medium text-brand"
                          : "text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      <span className="text-zinc-300">└</span>
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <main className="flex-1 overflow-y-auto px-6 py-6">
              {selected && (
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold text-zinc-900">{selected.name}</h1>
                    {selected.status && (
                      <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[selected.status]}`}>
                        {STATUS_LABEL[selected.status]}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-zinc-400">
                    기능 상세 페이지가 여기에 표시됩니다.
                  </p>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </>
  );
}
