# Cambios

## 0.1.6

- El panel del costado es un poco más ancho para que entren los seis colores primarios y el color actual.

## 0.1.5

- Colores primarios fuertes (negro, blanco, rojo, azul, verde, amarillo) en el panel del costado, tal cual también en el tema oscuro; se sacó la fila de colores del menú central.
- Línea recta al mantener quieto: también con el mouse, y solo el punto inicial se pega a la cuadrícula.
- Botón del lápiz asignado a la manito: ahora activa la manito normal (sin eventos simulados), así se mueve fluido.

## 0.1.4

- Barra de funciones personalizable: ejes 2D/3D, fórmula, imagen por URL y selección de lazo ya están arriba (se sacaron las barras de abajo). Clic derecho sobre un botón: quitarlo de la barra, moverlo, o asignarle un botón del lápiz/mouse. Lo que no está fijado queda en ⋮ (con 📌 para fijarlo). También se puede arrastrar para ordenar.
- Un botón del lápiz (p. ej. de la Wacom) puede asignarse a cualquier función: con la manito sirve para moverte por la hoja mientras lo mantenés apretado.
- Al empezar a dibujar se esconden los menús y queda solo la barra de arriba; al tocar un botón de la barra vuelven.
- ☰ → «Tamaño de la interfaz…»: achica o agranda menús y paneles (50–150 %).
- Panel lateral: abre en «Hojas»; el orden es búsqueda · hojas · elementos.

## 0.1.3

- Eje 3D: la diagonal va fija a 225° (ya no hay control de ángulo).
- Cuadrícula: con fondo cuadriculado o punteado, las líneas rectas del lápiz, la herramienta de línea, las formas y los ejes se pegan al vértice más cercano.
- Colores primarios fuertes (negro, rojo, azul, verde, amarillo, blanco) siempre a mano en la barra de trazos.
- Línea recta con el lápiz: solo se endereza si el trazo ya iba casi recto; escribir o hacer curvas con una pausa ya no genera rayas.
- Tabletas XP-Pen/Huion: ajuste «Mi tableta funciona como mouse» en ☰ → Lápiz y tableta.
- Exportar: nuevo formato PDF, y "Exportar imagen" (menú y Ctrl+Shift+E) usa el diálogo propio de la app.

## 0.1.2

- Línea recta con el lápiz: dibujando, si lo mantenés quieto ~0,5 s el trazo se endereza y sigue al lápiz hasta que lo levantás (se puede apagar en ☰ → Lápiz y tableta).
- Clic derecho en el panel de hojas: el menú ya no queda tapado por el panel (renombrar, mover, duplicar, exportar, papelera, nueva carpeta dentro de una carpeta).
- El puntero de dibujo es un punto chico y visible en vez de la cruz.

## 0.1.1

- La carpeta de trabajo solo se pregunta la primera vez (o si la carpeta guardada se borró); después se usa siempre la misma. Se puede cambiar desde el panel "Hojas".

## 0.1.0 — primera versión

App de escritorio para Windows basada en Excalidraw, sin cuentas ni servidores.

- Hojas y carpetas como archivos reales en una carpeta elegida al primer arranque; guardado automático, papelera de 15 días y detección de cambios externos.
- Trazos lápiz / fibra / resaltador, fondos de hoja (liso, cuadriculado, rayado, punteado), ejes 2D y 3D.
- Imágenes con `Ctrl+V`, arrastrando archivos o desde una dirección web; fórmulas LaTeX (KaTeX) editables con doble clic.
- Tabletas y lápiz: presión, rechazo de palma, "solo el lápiz dibuja", botón del lápiz configurable.
- Exportar hoja a PNG, SVG o `.excalidraw`.
- Instalador de Windows (sin firma digital) y auto-actualización desde GitHub Releases.
