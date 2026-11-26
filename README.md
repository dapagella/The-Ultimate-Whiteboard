# The Ultimate Whiteboard

Pizarra digital personal basada en [Excalidraw](https://github.com/excalidraw/excalidraw), con carpetas y hojas guardadas en tu computadora, ejes 2D/3D, trazos tipo lápiz/fibra/resaltador, fondos de hoja, fórmulas LaTeX y soporte para tabletas gráficas.

> Estado: en desarrollo (Fase 2 de 11). Ver [PLAN.md](PLAN.md).

## Desarrollo

Requisitos: Node >= 22 y Yarn 1 (`corepack enable` o `npm i -g yarn`).

```bash
yarn install
yarn desktop:dev      # app de escritorio (Electron) con recarga en vivo
yarn desktop:build    # compila la app de escritorio en desktop/dist
yarn desktop:start    # abre lo compilado
yarn start            # solo la interfaz web, en http://localhost:3001
yarn test:app         # tests
yarn test:typecheck   # TypeScript (interfaz + escritorio)
```

Si `yarn install` no descargó el binario de Electron, ejecutá `node node_modules/electron/install.js`.

La app de escritorio no usa cuentas, servidores ni internet: todo se sirve desde el propio paquete. Variables opcionales en `.env.local` (ver `.env.example`).

## Créditos y licencia

Este proyecto es un fork de **Excalidraw** — © 2020 Excalidraw y sus colaboradores — distribuido bajo la [licencia MIT](LICENSE). El archivo `LICENSE` original se conserva sin cambios. El README original de Excalidraw está en [docs/EXCALIDRAW_README.md](docs/EXCALIDRAW_README.md).

Los cambios propios de The Ultimate Whiteboard también se publican bajo MIT.
