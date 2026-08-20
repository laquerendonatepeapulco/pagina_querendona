const fs = require("fs");
const path = require("path");
const CleanCSS = require("clean-css");
const { minify } = require("terser");

const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "dist");

const staticEntries = [
  "index.html",
  "promociones.html",
  "latidos-de-mexico.html",
  "latidos-scanner.html",
  "tepeapulco.html",
  "sahagun.html",
  "menu.html",
  "nosotros.html",
  "chefs.html",
  "contacto.html",
  "styles.css",
  "styles2.css",
  "opcion.css",
  "evento.css",
  "latidos-scanner.css",
  "latidos-scanner.js",
  "script.js",
  "translations.js",
  "googleea7d02d04b945bef.html",
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

function findFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    return entry.isDirectory() ? findFiles(entryPath) : [entryPath];
  });
}

async function minifyPublicAssets() {
  const assets = findFiles(outDir).filter((filePath) =>
    [".css", ".js"].includes(path.extname(filePath).toLowerCase())
  );

  for (const filePath of assets) {
    const extension = path.extname(filePath).toLowerCase();
    const source = fs.readFileSync(filePath, "utf8");
    let output;

    if (extension === ".css") {
      const result = new CleanCSS({ level: 2 }).minify(source);

      if (result.errors.length) {
        throw new Error(`No se pudo minificar ${filePath}: ${result.errors.join(", ")}`);
      }

      output = result.styles;
    } else {
      const result = await minify(source, {
        compress: { passes: 2 },
        mangle: { toplevel: false },
        format: { comments: false }
      });

      if (!result.code) {
        throw new Error(`No se pudo minificar ${filePath}`);
      }

      output = result.code;
    }

    fs.writeFileSync(filePath, output, "utf8");
  }

  return assets.length;
}

async function build() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of staticEntries) {
    copyEntry(entry);
  }

  const minifiedAssets = await minifyPublicAssets();

  console.log(
    `Archivos estaticos listos en ${path.relative(rootDir, outDir)}; ${minifiedAssets} recursos CSS/JS minificados`
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
