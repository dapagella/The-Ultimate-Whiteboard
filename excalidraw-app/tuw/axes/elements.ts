/**
 * Crea, lee y regenera los ejes como elementos normales de Excalidraw:
 * flechas (`arrow`) y textos (`text`) AGRUPADOS, con `customData.tuw` que los identifica.
 * Así el archivo sigue abriéndose en Excalidraw y se mueven/escalan como un solo objeto.
 */
import { randomId } from "@excalidraw/common";
import {
  newArrowElement,
  newElementWith,
  newTextElement,
} from "@excalidraw/element";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import {
  DEFAULT_LABELS,
  axisTips,
  labelCenter,
  normalizeParams,
  rolesOf,
  tipToPolar,
} from "./geometry";

import type { AxisDim, AxisParams, AxisRole, Vec } from "./geometry";

export type AxisStyle = {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  fontFamily: number;
  fontSize: number;
};

export const DEFAULT_AXIS_STYLE: AxisStyle = {
  strokeColor: "#1e1e1e",
  strokeWidth: 2,
  opacity: 100,
  fontFamily: 5, // Excalifont
  fontSize: 20,
};

type TuwAxisData = {
  kind: "axis";
  axisId: string;
  dim: AxisDim;
  /** "x" | "y" | "z" para flechas; "label-x" … para etiquetas. */
  role: string;
};

const dataOf = (el: ExcalidrawElement): TuwAxisData | null => {
  const d = el.customData?.tuw;
  return d && d.kind === "axis" && typeof d.axisId === "string" ? d : null;
};

export const isAxisElement = (el: ExcalidrawElement): boolean => !!dataOf(el);
export const axisIdOf = (el: ExcalidrawElement): string | null =>
  dataOf(el)?.axisId ?? null;

const makeArrow = (
  origin: Vec,
  tip: Vec,
  style: AxisStyle,
  meta: TuwAxisData,
  groupId: string,
): ExcalidrawArrowElement =>
  newArrowElement({
    type: "arrow",
    x: origin.x,
    y: origin.y,
    points: [
      [0, 0],
      [tip.x, tip.y],
    ] as any,
    width: Math.abs(tip.x),
    height: Math.abs(tip.y),
    endArrowhead: "arrow",
    startArrowhead: null,
    strokeColor: style.strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: style.strokeWidth,
    strokeStyle: "solid",
    roughness: 0,
    opacity: style.opacity,
    roundness: null,
    locked: false,
    groupIds: [groupId],
    customData: { tuw: meta },
  }) as ExcalidrawArrowElement;

const makeLabel = (
  center: Vec,
  text: string,
  style: AxisStyle,
  meta: TuwAxisData,
  groupId: string,
): ExcalidrawTextElement => {
  const el = newTextElement({
    x: center.x,
    y: center.y,
    text,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily as any,
    textAlign: "center",
    verticalAlign: "middle",
    strokeColor: style.strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: style.opacity,
    roundness: null,
    locked: false,
    groupIds: [groupId],
    customData: { tuw: meta },
  });
  // el texto se coloca por su centro
  return newElementWith(el, {
    x: center.x - el.width / 2,
    y: center.y - el.height / 2,
  });
};

export type CreatedAxis = {
  axisId: string;
  groupId: string;
  elements: ExcalidrawElement[];
};

/** Arma un eje 2D o 3D completo (flechas + etiquetas) con el origen en `origin`. */
export const createAxisElements = (
  dim: AxisDim,
  origin: Vec,
  params: Partial<AxisParams>,
  style: AxisStyle = DEFAULT_AXIS_STYLE,
  labels: Partial<Record<AxisRole, string>> = {},
): CreatedAxis => {
  const axisId = randomId();
  const groupId = randomId();
  const p = normalizeParams(dim, params);
  const tips = axisTips(dim, p);
  const arrows: ExcalidrawElement[] = [];
  const texts: ExcalidrawElement[] = [];
  for (const role of rolesOf(dim)) {
    const tip = tips[role]!;
    arrows.push(
      makeArrow(
        origin,
        tip,
        style,
        { kind: "axis", axisId, dim, role },
        groupId,
      ),
    );
    const c = labelCenter(tip);
    texts.push(
      makeLabel(
        { x: origin.x + c.x, y: origin.y + c.y },
        labels[role] ?? DEFAULT_LABELS[role],
        style,
        { kind: "axis", axisId, dim, role: `label-${role}` },
        groupId,
      ),
    );
  }
  return { axisId, groupId, elements: [...arrows, ...texts] };
};

// ---------------------------------------------------------------------------
// Leer y regenerar
// ---------------------------------------------------------------------------
export type AxisInfo = {
  axisId: string;
  dim: AxisDim;
  origin: Vec;
  params: AxisParams;
};

const membersOf = (elements: readonly ExcalidrawElement[], axisId: string) =>
  elements.filter((e) => !e.isDeleted && dataOf(e)?.axisId === axisId);

/** Lee el tamaño actual de un eje a partir de sus flechas (así respeta lo que el usuario escaló). */
export const readAxis = (
  elements: readonly ExcalidrawElement[],
  axisId: string,
): AxisInfo | null => {
  const members = membersOf(elements, axisId);
  const arrow = (role: AxisRole) =>
    members.find((m) => dataOf(m)?.role === role && m.type === "arrow") as
      | ExcalidrawArrowElement
      | undefined;
  const ax = arrow("x");
  const ay = arrow("y");
  if (!ax || !ay) {
    return null;
  }
  const az = arrow("z");
  const dim: AxisDim = az ? 3 : 2;
  const tip = (a: ExcalidrawArrowElement): Vec => {
    const last = a.points[a.points.length - 1];
    return { x: last[0], y: last[1] };
  };
  const params: AxisParams = {
    lengthX: Math.abs(tip(ax).x),
    lengthY: Math.abs(tip(ay).y),
  };
  if (az) {
    const polar = tipToPolar(tip(az));
    params.lengthZ = polar.length;
    params.angleZDeg = polar.angleDeg;
  }
  return { axisId, dim, origin: { x: ax.x, y: ax.y }, params };
};

/**
 * Devuelve la lista de elementos con el eje ajustado a `params` (mismo origen, mismos ids,
 * mismo texto en las etiquetas, aunque el usuario las haya editado).
 */
export const regenerateAxis = (
  elements: readonly ExcalidrawElement[],
  axisId: string,
  params: Partial<AxisParams>,
): ExcalidrawElement[] => {
  const info = readAxis(elements, axisId);
  if (!info) {
    return [...elements];
  }
  const p = normalizeParams(info.dim, { ...info.params, ...params });
  const tips = axisTips(info.dim, p);
  return elements.map((el) => {
    const meta = dataOf(el);
    if (!meta || meta.axisId !== axisId) {
      return el;
    }
    if (
      el.type === "arrow" &&
      (meta.role === "x" || meta.role === "y" || meta.role === "z")
    ) {
      const tip = tips[meta.role as AxisRole];
      if (!tip) {
        return el;
      }
      return newElementWith(el as ExcalidrawArrowElement, {
        x: info.origin.x,
        y: info.origin.y,
        points: [
          [0, 0],
          [tip.x, tip.y],
        ] as any,
        width: Math.abs(tip.x),
        height: Math.abs(tip.y),
      });
    }
    if (el.type === "text" && meta.role.startsWith("label-")) {
      const tip = tips[meta.role.slice("label-".length) as AxisRole];
      if (!tip) {
        return el;
      }
      const c = labelCenter(tip);
      return newElementWith(el, {
        x: info.origin.x + c.x - el.width / 2,
        y: info.origin.y + c.y - el.height / 2,
      });
    }
    return el;
  });
};

/** Id del eje al que pertenece algún elemento seleccionado (o null). */
export const axisIdFromSelection = (
  elements: readonly ExcalidrawElement[],
  selectedIds: Readonly<Record<string, boolean>>,
): string | null => {
  for (const el of elements) {
    if (!el.isDeleted && selectedIds[el.id]) {
      const id = axisIdOf(el);
      if (id) {
        return id;
      }
    }
  }
  return null;
};
