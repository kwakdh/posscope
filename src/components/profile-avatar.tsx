"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./avatar";

type ProfileAvatarProps = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function ProfileAvatar({ userId, name, avatarUrl }: ProfileAvatarProps) {
  const [url, setUrl] = useState(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("이미지 크기는 2MB 이하여야 합니다.");
      return;
    }

    setError(null);
    setUploading(true);

    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      setUploading(false);
      return;
    }

    setUrl(publicUrl);
    setUploading(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="프로필 이미지 변경"
        className="relative rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        <Avatar name={name} avatarUrl={url} size={32} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
