import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useClickThrough } from "./useClickThrough";
import { useEdgeWalk } from "./useEdgeWalk";
import "./App.css";

type Mood = "idle" | "happy" | "sleep";

const moods: Mood[] = ["idle", "happy", "sleep"];

async function ensureAlwaysOnTop() {
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(true);
  // Some Linux WMs drop the flag after focus changes; re-apply periodically.
  return window.setInterval(() => {
    void win.setAlwaysOnTop(true);
  }, 2000);
}

function App() {
  const [mood, setMood] = useState<Mood>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const walk = useEdgeWalk({ paused: menuOpen || mood === "sleep" });
  const petRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickThrough({
    hitRefs: [petRef, menuRef],
    pinnedRef: walk.interactingRef,
  });

  const cycleMood = useCallback(() => {
    setMood((current) => {
      const next = moods[(moods.indexOf(current) + 1) % moods.length];
      return next;
    });
    setMenuOpen(false);
  }, []);

  const quit = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    void ensureAlwaysOnTop().then((id) => {
      timer = id;
    });
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="stage" data-edge={walk.pose.edge}>
      <div
        ref={petRef}
        className={`pet mood-${mood}${walk.pose.moving ? " walking" : ""}`}
        style={
          {
            "--pet-rot": `${walk.pose.rotation}deg`,
            "--pet-flip": walk.pose.facing === "left" ? -1 : 1,
          } as CSSProperties
        }
        onPointerDown={walk.onPointerDown}
        onPointerMove={walk.onPointerMove}
        onPointerUp={walk.onPointerUp}
        onPointerCancel={walk.onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onClick={() => {
          if (walk.shouldIgnoreClick()) return;
          if (menuOpen) {
            setMenuOpen(false);
            return;
          }
          cycleMood();
        }}
      >
        <div className="shadow" />
        <div className="body">
          <div className="cheek left" />
          <div className="cheek right" />
          <div className={`eye left ${mood === "sleep" ? "closed" : ""}`} />
          <div className={`eye right ${mood === "sleep" ? "closed" : ""}`} />
          <div className={`mouth ${mood}`} />
        </div>
      </div>

      {menuOpen && (
        <div
          ref={menuRef}
          className="menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={cycleMood}>
            Change mood
          </button>
          <button type="button" className="danger" onClick={quit}>
            Quit
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
