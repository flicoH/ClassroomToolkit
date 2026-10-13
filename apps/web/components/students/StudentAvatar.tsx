"use client";

import { useState } from "react";
import { CircleUserRound } from "lucide-react";

/** A failed image falls back to the original initials; a replacement gets a fresh attempt. */
export function StudentAvatar({ name, photo }: { name: string; photo?: string | null }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
      {photo && photo !== failedPhoto ? (
        <img
          src={photo}
          alt={`${name}的头像`}
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailedPhoto(photo)}
        />
      ) : (
        <>
          {name.slice(0, 1) || "学"}
          <CircleUserRound className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-white text-blue-500 dark:bg-slate-900" />
        </>
      )}
    </div>
  );
}
