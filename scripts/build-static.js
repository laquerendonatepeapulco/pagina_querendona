const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "dist");

const staticEntries = [
  "index.html",
  "tepeapulco.html",
  "sahagun.html",
  "menu.html",
  "nosotros.html",
  "chefs.html",
  "contacto.html",
  "styles.css",
  "styles2.css",
  "opcion.css",
  "script.js",
  "translations.js",
  "robots.txt",
  "sitemap.xml",
  "img",
  path.join("inventario", "index.html"),
  path.join("inventario", "login.html"),
  path.join("inventario", "styles.css"),
  path.join("inventario", "app.js"),
  path.join("inventario", "auth.js"),
  path.join("inventario", "login.js"),
  path.join("inventario", "img")
];

function copyEntry(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(outDir, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`No existe el archivo requerido para publicar: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of staticEntries) {
  copyEntry(entry);
}

console.log(`Archivos estaticos listos en ${path.relative(rootDir, outDir)}`);
