/**
 * Feature flags de The Ultimate Whiteboard.
 * Se leen de variables VITE_TUW_* (ver .env.example).
 */

/**
 * Colaboración en tiempo real (socket.io + Firebase heredados de Excalidraw).
 * Apagada por defecto: se reemplaza por Supabase Realtime solo si se prioriza (PLAN.md, Fase 11).
 */
export const TUW_COLLAB_ENABLED =
  import.meta.env.VITE_TUW_ENABLE_COLLAB === "true";
