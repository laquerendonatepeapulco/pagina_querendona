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
- `GOOGLE_WALLET_ISSUER_ID`: identificador numerico del emisor asignado en Google Wallet Business Console.
- `GOOGLE_WALLET_CLASS_ID`: identificador completo de la clase aprobada para el evento, con formato `ISSUER_ID.latidos_mexico_2026`.
- `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`: contenido JSON completo y privado de la cuenta de servicio autorizada en Google Wallet Business Console. Marcar como variable sensible y no agregarlo al repositorio.

El boton de Google Wallet solo se muestra cuando las tres variables de Google Wallet estan configuradas. Antes de produccion, el propietario debe completar el alta del emisor, autorizar la cuenta de servicio, crear la clase de tipo Event Ticket y solicitar acceso de publicacion. La clase debe incluir `Latidos de Mexico`, la fecha `12 de septiembre de 2026` y el lugar `Restaurante La Querendona, Tepeapulco`; esos datos comunes se combinan con el titular, experiencia y QR unico que genera el sitio. Mientras el emisor siga en modo de demostracion, Google mostrara `[TEST ONLY]` en los pases.

Rutas principales:

- Sitio publico: `/`
- Inventario: `/inventario/login.html`
- API del inventario: `/api/*`
- Checkout de Latidos de Mexico: `/api/latidos/checkout`
- Verificacion de pagos de Latidos de Mexico: `/api/latidos/payment`
- Pase de Google Wallet por boleto: `/api/latidos/tickets/:token/wallet`
- Registros privados de Latidos (solo administradores): `/latidos-registros.html`
- API privada de registros y pagos confirmados: `/api/latidos/registrations`
