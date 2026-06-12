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

export function ProductTabs({ products }: ProductTabsProps) {
  const [activeSlug, setActiveSlug] = useState(products[0]?.slug ?? "");
  const active = products.find((p) => p.slug === activeSlug);

  return (
    <>
      <nav className="flex gap-1 border-b border-zinc-200 bg-white px-6">
        {products.map((product) => (
          <button
            key={product.slug}
            onClick={() => setActiveSlug(product.slug)}
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

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {!active || active.categories.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-400">
            아직 등록된 기능 메뉴가 없습니다.
          </div>
        ) : (
          <div className="space-y-8">
            {active.categories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-3 text-sm font-semibold text-zinc-900">{category.name}</h2>
                {category.features.length === 0 ? (
                  <p className="text-sm text-zinc-400">등록된 기능이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {category.features.map((feature) => (
                      <div
                        key={feature.id}
                        className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 transition-colors hover:border-brand"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{feature.name}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[feature.status]}`}>
                            {STATUS_LABEL[feature.status]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
