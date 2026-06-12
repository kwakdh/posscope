"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";

type OnlineUsersProps = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

type PresenceUser = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

const HEARTBEAT_INTERVAL = 60 * 1000;

export function OnlineUsers({ userId, name, avatarUrl }: OnlineUsersProps) {
  const [online, setOnline] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const supabase = createClient();

    const updateLastSeen = () => {
      supabase.from("users").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
    };

    const channel = supabase.channel("posscope:online", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users = Object.values(state)
          .map((presences) => presences[0])
          .filter(Boolean);
        setOnline(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, name, avatar_url: avatarUrl });
          updateLastSeen();
        }
      });

    const interval = setInterval(updateLastSeen, HEARTBEAT_INTERVAL);

    return () => {
      clearInterval(interval);
      updateLastSeen();
      supabase.removeChannel(channel);
    };
  }, [userId, name, avatarUrl]);

  if (online.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {online.map((u) => (
        <div key={u.user_id} title={u.user_id === userId ? `${u.name} (나)` : u.name}>
          <Avatar
            name={u.name}
            avatarUrl={u.avatar_url}
            size={28}
            className="ring-2 ring-white"
          />
        </div>
      ))}
    </div>
  );
}
