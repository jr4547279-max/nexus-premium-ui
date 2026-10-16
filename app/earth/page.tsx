export const metadata = {
  title: "Nexus Earth",
  description: "Interactive 3D Earth experience for Nexus",
};

export default function EarthPage() {
  return (
    <main style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      <iframe
        src="/nexus-earth.html"
        title="Nexus Earth"
        allow="fullscreen; geolocation"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
