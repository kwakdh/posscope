"use client";

import { useState } from "react";
import { FeatureDetail } from "./feature-detail";

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
  itemType: "home" | "category" | "feature";
  children?: SidebarItem[];
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
const FLAT_CATEGORY_NAMES = new Set(["상품", "테이블", "주문 현황", "모드 변경 (키오스크 모드)"]);
// 메뉴에 노출하지 않는 카테고리/기능
const HIDDEN_CATEGORY_NAMES = new Set(["결제"]);
const HIDDEN_FEATURE_NAMES = new Set(["이용 가이드"]);
// 메뉴에 표시할 이름 변경
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  "상품": "상품 (결제)",
  "모드 변경 (키오스크 모드)": "키오스크",
};

const HOME_ITEM: SidebarItem = { id: "home", name: "첫화면", status: null, itemType: "home" };

function buildSidebarItems(categories: Category[]): SidebarItem[] {
  return [
    HOME_ITEM,
    ...categories
      .filter((category) => !HIDDEN_CATEGORY_NAMES.has(category.name))
      .map((category) => {
        const name = CATEGORY_LABEL_OVERRIDES[category.name] ?? category.name;
        if (FLAT_CATEGORY_NAMES.has(category.name)) {
          return { id: category.id, name, status: null, itemType: "category" as const };
        }
        return {
          id: category.id,
          name,
          status: null,
          itemType: "category" as const,
          children: category.features
            .filter((feature) => !HIDDEN_FEATURE_NAMES.has(feature.name))
            .map((feature) => ({
              id: feature.id,
              name: feature.name,
              status: null,
              itemType: "feature" as const,
            })),
        };
      }),
  ];
}

function flattenLeaves(items: SidebarItem[]): SidebarItem[] {
  return items.flatMap((item) => (item.children ? [item, ...item.children] : [item]));
}

export function ProductTabs({ products }: ProductTabsProps) {
  const [activeSlug, setActiveSlug] = useState(products[0]?.slug ?? "");
  const active = products.find((p) => p.slug === activeSlug);

  const sidebarItems = active ? buildSidebarItems(active.categories) : [];
  const leaves = flattenLeaves(sidebarItems);
  const [selectedId, setSelectedId] = useState<string | null>(leaves[0]?.id ?? null);
  const selected = leaves.find((item) => item.id === selectedId) ?? leaves[0] ?? null;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(sidebarItems.filter((item) => item.children).map((item) => item.id))
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectProduct(slug: string) {
    setActiveSlug(slug);
    const items = buildSidebarItems(products.find((p) => p.slug === slug)?.categories ?? []);
    setSelectedId(flattenLeaves(items)[0]?.id ?? null);
    setExpandedIds(new Set(items.filter((item) => item.children).map((item) => item.id)));
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
            <aside className="w-52 shrink-0 overflow-y-auto bg-[#f5f5f7] px-2 py-4">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {active?.name}
              </div>
              <ul className="space-y-0.5">
                {sidebarItems.map((item) =>
                  item.children ? (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setSelectedId(item.id);
                          toggleExpanded(item.id);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 ${
                          item.id === selected?.id
                            ? "bg-white text-zinc-900 shadow-sm"
                            : "text-zinc-700 hover:bg-white/60"
                        }`}
                      >
                        <span>{item.name}</span>
                        <span
                          className={`text-zinc-400 transition-transform duration-150 ${
                            expandedIds.has(item.id) ? "rotate-90" : ""
                          }`}
                        >
                          ›
                        </span>
                      </button>
                      {expandedIds.has(item.id) && (
                        <ul className="mt-0.5 space-y-0.5 pl-3">
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <button
                                onClick={() => setSelectedId(child.id)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                                  child.id === selected?.id
                                    ? "bg-white font-medium text-zinc-900 shadow-sm"
                                    : "text-zinc-600 hover:bg-white/60"
                                }`}
                              >
                                <span>{child.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ) : (
                    <li key={item.id}>
                      <button
                        onClick={() => setSelectedId(item.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                          item.id === selected?.id
                            ? "bg-white font-medium text-zinc-900 shadow-sm"
                            : "text-zinc-600 hover:bg-white/60"
                        }`}
                      >
                        <span>{item.name}</span>
                        {item.status && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[item.status]}`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                )}
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
                  {selected.itemType === "home" ? (
                    <p className="mt-4 text-sm text-zinc-400">첫화면입니다.</p>
                  ) : (
                    <FeatureDetail key={selected.id} itemType={selected.itemType} itemId={selected.id} />
                  )}
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </>
  );
}
