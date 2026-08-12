# Deploy en Vercel

Este proyecto publica el sitio como archivos estaticos en `dist/` y usa una Vercel Function para el inventario en `/api`.

Configuracion recomendada en Vercel:

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Root Directory: dejar en la raiz del repositorio

Variables de entorno necesarias:

- `DATABASE_URL`: cadena de conexion de Neon/PostgreSQL. En Neon normalmente termina con `?sslmode=require`.
- `SESSION_SECRET`: texto largo y privado para firmar sesiones del inventario.
- `MERCADO_PAGO_ACCESS_TOKEN`: credencial privada de produccion para crear y verificar los pagos de Latidos de Mexico.
- `PUBLIC_SITE_URL`: URL publica usada para regresar desde Mercado Pago. En produccion: `https://laquerendonacg.com`.

Rutas principales:

- Sitio publico: `/`
- Inventario: `/inventario/login.html`
- API del inventario: `/api/*`
- Checkout de Latidos de Mexico: `/api/latidos/checkout`
- Verificacion de pagos de Latidos de Mexico: `/api/latidos/payment`
