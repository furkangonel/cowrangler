import React, { useMemo } from "react";
import {
  ROBOT_CELLS,
  ROBOT_CELL_SIZE,
  ROBOT_W,
  ROBOT_H,
  RobotPart,
} from "./robotCells.generated";

interface Props {
  /** Piksel cinsinden boyut. */
  size?: number;
  /** true iken maskot piksel piksel dağılıp toplanan + bacak vuran loader döngüsüne girer. */
  active?: boolean;
  className?: string;
  /** Gövde rengi — varsayılan marka turuncusu. */
  color?: string;
}

interface Pixel {
  col: number;
  row: number;
  part: RobotPart;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  delay: number;
}

// Deterministik sözde-rastgele — her piksel her render'da aynı yöne dağılsın
// (React yeniden render ettiğinde animasyon "zıplamasın").
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const PIXELS: Pixel[] = ROBOT_CELLS.map(([col, row, part], i) => {
  const angle = rand(i * 7 + 1) * Math.PI * 2;
  const dist = 15 + rand(i * 13 + 2) * 44;
  return {
    col,
    row,
    part,
    x: col * ROBOT_CELL_SIZE,
    y: row * ROBOT_CELL_SIZE,
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist - 8,
    rot: (rand(i * 5 + 3) - 0.5) * 150,
    delay: rand(i * 3 + 4) * 0.45,
  };
});

const PARTS: RobotPart[] = ["body", "leg-left", "leg-right"];

// Göz oyuklarının arkasında parlayan minik ışıklar (asıl siluet PNG'deki
// negatif boşluklarla aynı konumda — bkz. robotCells.generated.ts üretim scripti).
const EYE_LEFT = { x: 8 * ROBOT_CELL_SIZE, y: 7 * ROBOT_CELL_SIZE, w: 2 * ROBOT_CELL_SIZE, h: 5 * ROBOT_CELL_SIZE };
const EYE_RIGHT = { x: 16 * ROBOT_CELL_SIZE, y: 7 * ROBOT_CELL_SIZE, w: 3 * ROBOT_CELL_SIZE, h: 5 * ROBOT_CELL_SIZE };

/**
 * Cowrangler robot maskotu — loader hali.
 * Marka ikonunun (cw.png) birebir siluetinden üretilmiş piksel gridi olarak
 * çizilir; `active` iken gövde piksel piksel dağılıp karmaşa halinde hareket
 * eder ve tekrar toplanır, bacaklar toplanma anlarında hafifçe adım atar,
 * gözler yumuşakça parlar. Metin/"loading" yazısı YOK — salt şekil animasyonu.
 */
export function RobotLoader({ size = 40, active = true, className = "", color }: Props) {
  const groups = useMemo(() => {
    const g: Record<RobotPart, Pixel[]> = { body: [], "leg-left": [], "leg-right": [] };
    for (const p of PIXELS) g[p.part].push(p);
    return g;
  }, []);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ROBOT_W} ${ROBOT_H}`}
      className={`robot-loader ${active ? "robot-loader--active" : ""} ${className}`}
      style={color ? ({ "--robot-color": color } as React.CSSProperties) : undefined}
      aria-label="Cowrangler working"
      role="img"
    >
      <g className="robot-loader__bob">
        <rect className="robot-loader__eye" x={EYE_LEFT.x} y={EYE_LEFT.y} width={EYE_LEFT.w} height={EYE_LEFT.h} rx={1.5} />
        <rect className="robot-loader__eye" x={EYE_RIGHT.x} y={EYE_RIGHT.y} width={EYE_RIGHT.w} height={EYE_RIGHT.h} rx={1.5} />

        {PARTS.map((part) => (
          <g key={part} className={`robot-loader__part robot-loader__part--${part}`}>
            {groups[part].map((p) => (
              <rect
                key={`${p.col}-${p.row}`}
                x={p.x}
                y={p.y}
                width={ROBOT_CELL_SIZE}
                height={ROBOT_CELL_SIZE}
                className="robot-loader__px"
                style={
                  {
                    "--dx": `${p.dx}px`,
                    "--dy": `${p.dy}px`,
                    "--rot": `${p.rot}deg`,
                    "--dl": `${p.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
