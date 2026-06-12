"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { formatRelativeTime } from "@/lib/relative-time";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  avatar_url: string | null;
  last_seen_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "거절됨",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  planner: "기획자",
  developer: "개발자",
  viewer: "열람자",
};

export function UsersTable({ initialUsers }: { initialUsers: User[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateUser(id: string, body: Record<string, string>) {
    setError(null);
    setBusyId(id);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
    }
    setBusyId(null);
    router.refresh();
  }

  async function removeUser(id: string) {
    if (!confirm("이 사용자를 삭제하시겠습니까?")) return;
    setBusyId(id);
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">이름</th>
            <th className="px-4 py-3 font-medium">이메일</th>
            <th className="px-4 py-3 font-medium">권한</th>
            <th className="px-4 py-3 font-medium">상태</th>
            <th className="px-4 py-3 font-medium">마지막 접속</th>
            <th className="px-4 py-3 font-medium">작업</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {initialUsers.map((u) => (
            <tr key={u.id} className={busyId === u.id ? "opacity-50" : ""}>
              <td className="px-4 py-3 text-zinc-900">
                <div className="flex items-center gap-2">
                  <Avatar name={u.name} avatarUrl={u.avatar_url} size={24} />
                  {u.name}
                </div>
              </td>
              <td className="px-4 py-3 text-zinc-600">{u.email}</td>
              <td className="px-4 py-3">
                {u.role === "admin" ? (
                  <span className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-500">
                    {ROLE_LABEL.admin}
                  </span>
                ) : (
                  <select
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500"
                  >
                    {Object.entries(ROLE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    "rounded-full px-2 py-1 text-xs font-medium " +
                    (u.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : u.status === "rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700")
                  }
                >
                  {STATUS_LABEL[u.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-500">{formatRelativeTime(u.last_seen_at)}</td>
              <td className="px-4 py-3">
                {u.role === "admin" ? (
                  <span className="text-xs text-zinc-400">-</span>
                ) : (
                  <div className="flex gap-2">
                    {u.status !== "approved" && (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => updateUser(u.id, { status: "approved" })}
                        className="rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                      >
                        승인
                      </button>
                    )}
                    {u.status !== "rejected" && (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => updateUser(u.id, { status: "rejected" })}
                        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        거절
                      </button>
                    )}
                    <button
                      disabled={busyId === u.id}
                      onClick={() => removeUser(u.id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {initialUsers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-zinc-400">
                등록된 사용자가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
