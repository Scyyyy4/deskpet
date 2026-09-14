import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { needsAlwaysOnTopWatch } from "./platform";
import {
  SKIN_LABELS,
  SKINS,
  loadSavedSkin,
  saveSkin,
  type Skin,
} from "./skins";
import { useClickThrough } from "./useClickThrough";
import { useEdgeWalk } from "./useEdgeWalk";
import { useWindowResize } from "./useWindowResize";
import "./App.css";

type Mood = "idle" | "happy" | "sleep";

const moods: Mood[] = ["idle", "happy", "sleep"];

async function ensureAlwaysOnTop() {
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(true);
  if (!needsAlwaysOnTopWatch(navigator.userAgent)) return undefined;
  // Some Linux WMs drop the flag after focus changes; re-apply periodically.
  return window.setInterval(() => {
    void win.setAlwaysOnTop(true);
  }, 2000);
}

function App() {
  const [mood, setMood] = useState<Mood>("idle");
  const [skin, setSkin] = useState<Skin>(loadSavedSkin);
  const [menuOpen, setMenuOpen] = useState(false);
  const resizingRef = useRef(false);
  const walk = useEdgeWalk({
    paused: menuOpen || mood === "sleep",
    extraPausedRefs: [resizingRef],
  });
  const resize = useWindowResize({
    edge: walk.pose.edge,
    resizingRef,
  });
  const petRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickThrough({
    hitRefs: [petRef, menuRef],
    pinnedRefs: [walk.interactingRef, resize.resizingRef],
    movingRef: walk.movingRef,
    positionRef: walk.positionRef,
  });

  const cycleMood = useCallback(() => {
    setMood((current) => {
      const next = moods[(moods.indexOf(current) + 1) % moods.length];
      return next;
    });
    setMenuOpen(false);
  }, []);

  const chooseSkin = useCallback((next: Skin) => {
    setSkin(next);
    saveSkin(next);
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

  useEffect(() => {
    void resize.ensureMenuRoom(menuOpen);
  }, [menuOpen, resize.ensureMenuRoom]);

  return (
    <main
      className="stage"
      data-edge={walk.pose.edge}
      style={{ "--pet-scale": resize.scale } as CSSProperties}
    >
      <div
        ref={petRef}
        className={`pet mood-${mood}${walk.pose.moving ? " walking" : ""}`}
        data-skin={skin}
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
        onWheel={resize.onWheel}
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
        <div className="pet-gfx">
          <div className="shadow" />
          <div className="body">
            <div className="ear left" />
            <div className="ear right" />
            <div className="cheek left" />
            <div className="cheek right" />
            <div className={`eye left ${mood === "sleep" ? "closed" : ""}`} />
            <div className={`eye right ${mood === "sleep" ? "closed" : ""}`} />
            <div className="nose" />
            <div className={`mouth ${mood}`} />
          </div>
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
            换心情
          </button>
          <p className="menu-label">皮肤</p>
          <div className="menu-skins" role="group" aria-label="皮肤">
            {SKINS.map((id) => (
              <button
                key={id}
                type="button"
                className={skin === id ? "active" : undefined}
                aria-pressed={skin === id}
                onClick={() => chooseSkin(id)}
              >
                {SKIN_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="menu-label">大小</p>
          <div className="menu-size" role="group" aria-label="大小">
            <button type="button" onClick={() => resize.nudge(-1)}>
              缩小
            </button>
            <button type="button" onClick={() => resize.nudge(1)}>
              放大
            </button>
          </div>
          <button type="button" className="danger" onClick={quit}>
            退出
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
