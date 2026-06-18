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
  currentUserName: string;
  canEdit: boolean;
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

// 슬러그 → 결정론적 UUID 변환 (PostgreSQL uuid 타입 호환)
// namespace prefix: 686f6d65-686f-4d65 ("home" ASCII hex)
function homeItemUUID(slug: string): string {
  const hex = Array.from(slug)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(12, "0")
    .slice(0, 12);
  return `686f6d65-686f-4d65-8000-${hex}`;
}

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

export function ProductTabs({ products, currentUserName, canEdit }: ProductTabsProps) {
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
      <nav className="flex items-center gap-1 bg-white px-6 py-3">
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1">
          {products.map((product) => (
            <button
              key={product.slug}
              onClick={() => handleSelectProduct(product.slug)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                product.slug === activeSlug
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {product.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex flex-1 gap-3 overflow-hidden bg-surface p-3">
        {sidebarItems.length === 0 ? (
          <main className="flex flex-1 items-center justify-center rounded-3xl bg-white text-ink-muted">
            아직 등록된 기능 메뉴가 없습니다.
          </main>
        ) : (
          <>
            <aside className="w-56 shrink-0 overflow-y-auto rounded-3xl bg-white px-3 py-5">
              <div className="px-3 pb-3 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                {active?.name}
              </div>
              <ul className="space-y-1">
                {sidebarItems.map((item) =>
                  item.children ? (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setSelectedId(item.id);
                          toggleExpanded(item.id);
                        }}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-150 ${
                          item.id === selected?.id
                            ? "bg-brand/10 text-brand"
                            : "text-ink hover:bg-zinc-100"
                        }`}
                      >
                        <span>{item.name}</span>
                        <span
                          className={`text-ink-muted transition-transform duration-150 ${
                            expandedIds.has(item.id) ? "rotate-90" : ""
                          }`}
                        >
                          ›
                        </span>
                      </button>
                      {expandedIds.has(item.id) && (
                        <ul className="mt-1 space-y-1 pl-3">
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <button
                                onClick={() => setSelectedId(child.id)}
                                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                                  child.id === selected?.id
                                    ? "bg-brand/10 font-semibold text-brand"
                                    : "text-ink-muted hover:bg-zinc-100 hover:text-ink"
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
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                          item.id === selected?.id
                            ? "bg-brand/10 font-semibold text-brand"
                            : "text-ink hover:bg-zinc-100"
                        }`}
                      >
                        <span>{item.name}</span>
                        {item.status && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                )}
              </ul>
            </aside>

            <main className="flex-1 overflow-y-auto rounded-3xl bg-white px-6 py-6">
              {selected && (
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-ink">{selected.name}</h1>
                    {selected.status && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[selected.status]}`}>
                        {STATUS_LABEL[selected.status]}
                      </span>
                    )}
                  </div>
                  <FeatureDetail
                    key={selected.id}
                    itemType={selected.itemType === "home" ? "category" : selected.itemType}
                    itemId={selected.itemType === "home" ? homeItemUUID(activeSlug) : selected.id}
                    currentUserName={currentUserName}
                    canEdit={canEdit}
                  />
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </>
  );
}
