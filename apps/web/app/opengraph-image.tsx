import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = siteConfig.name;
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#eff6ff",
        color: "#0f172a",
        fontFamily: "sans-serif"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 52 }}>
        <div
          style={{
            width: 180,
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 36,
            background: "#2563eb",
            color: "#ffffff",
            fontSize: 64,
            fontWeight: 800
          }}
        >
          CT
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800 }}>Classroom Toolkit</div>
          <div style={{ fontSize: 34, color: "#475569" }}>Smart classroom tools for teachers</div>
          <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#1d4ed8" }}>
            <span>Random Picker</span>
            <span>·</span>
            <span>Timer</span>
            <span>·</span>
            <span>Pet Points</span>
            <span>·</span>
            <span>Rewards</span>
          </div>
        </div>
      </div>
    </div>,
    size
  );
}
