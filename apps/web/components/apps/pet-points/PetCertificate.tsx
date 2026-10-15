"use client";
import { useEffect, useRef, useState } from "react";
import { petOptions, PetSprite } from "@/components/semester-reports/ReportPetView";
import { Button } from "@/components/ui/button";
import type { CompletedPetView } from "../PetPoints";

/** Export the immutable completed snapshot, never the student's current pet. */
export function PetCertificate({
  snapshot,
  name,
  kind,
  onClose,
  onError
}: {
  snapshot: CompletedPetView;
  name: string;
  kind: "certificate" | "memory";
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const exporting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pet = petOptions.find(option => option.id === snapshot.petId);
  const save = async () => {
    if (!content.current || exporting.current) return;
    exporting.current = true;
    setSaving(true);
    setError("");
    try {
      await document.fonts?.ready;
      const images = Array.from(content.current.querySelectorAll("img"));
      await Promise.all(
        images.map(img =>
          img.complete
            ? img.naturalWidth
              ? Promise.resolve()
              : Promise.reject(new Error("宠物图片加载失败"))
            : new Promise<void>((resolve, reject) => {
                const done = (failure?: Error) => {
                  window.clearTimeout(timer);
                  img.removeEventListener("load", loaded);
                  img.removeEventListener("error", failed);
                  if (failure) reject(failure);
                  else resolve();
                };
                const loaded = () => done();
                const failed = () => done(new Error("宠物图片加载失败"));
                const timer = window.setTimeout(() => done(new Error("宠物图片加载超时，请重试")), 15000);
                img.addEventListener("load", loaded, { once: true });
                img.addEventListener("error", failed, { once: true });
              })
        )
      );
      const { toPng } = await import("html-to-image");
      const result = await toPng(content.current, { pixelRatio: 2, backgroundColor: "#fffaf0", cacheBust: true });
      if (!result.startsWith("data:image/png;base64,") || result.length < 100) throw new Error("生成图片为空，请重试");
      if (!alive.current) return;
      setImage(result);
      const anchor = document.createElement("a");
      anchor.href = result;
      anchor.download = `成长奖状-${name}-${snapshot.id}.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (failure) {
      if (!alive.current) return;
      const message = failure instanceof Error ? failure.message : "图片生成失败，请重试";
      setError(message);
      onError(message);
    } finally {
      exporting.current = false;
      if (alive.current) setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <section data-pet-dialog className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{kind === "certificate" ? "成长奖状" : "满级合影纪念"}</h3>
          <Button variant="ghost" onClick={onClose} aria-label="关闭成长纪念">
            关闭
          </Button>
        </div>
        <div
          ref={content}
          className="mt-3 break-words rounded-xl border-4 border-amber-300 bg-amber-50 p-5 text-center"
        >
          <h4 className="text-2xl font-black">满级养成纪念</h4>
          <p className="mt-3 font-bold">
            {name} 与 {snapshot.petName}
          </p>
          {pet && <PetSprite pet={pet} stageIndex={9} className="mx-auto w-40" />}
          <p>
            Lv.{snapshot.level} · {snapshot.stage}
          </p>
          <p>本轮已获得 {snapshot.earnedBadges} 枚成长徽章</p>
          <p>{new Date(snapshot.completedAt).toLocaleDateString("zh-CN")}</p>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-red-600">
            {error}
          </p>
        )}
        {image && (
          <div>
            <img src={image} alt="已生成的成长奖状预览" className="mt-3 w-full" />
            <a
              className="mt-3 inline-block rounded-lg border px-4 py-2 text-sm font-bold"
              href={image}
              download={`成长奖状-${name}-${snapshot.id}.png`}
            >
              下载已生成奖状
            </a>
          </div>
        )}
        {kind === "certificate" && (
          <Button className="mt-3" disabled={saving || !pet} onClick={() => void save()}>
            {saving ? "正在生成…" : "生成并下载奖状"}
          </Button>
        )}
      </section>
    </div>
  );
}
