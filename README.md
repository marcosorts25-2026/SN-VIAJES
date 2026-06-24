# SOMOS NOCHE TRANSPORTE (PWA)

Proyecto mínimo PWA con Vite + React. Funciona en celular y PC (navegador).

Requisitos:
- Node.js (v14+), npm o yarn

Instalación y desarrollo:

```bash
npm install
npm run dev
```

Por defecto Vite sirve en `http://localhost:5173`.
Para abrir desde tu celular en la misma red, usa la IP local del PC:

```bash
# en Windows, copia la IPv4 desde ipconfig
# y abre en el celular: http://<TU_IP>:5173
```

Construir y previsualizar:

```bash
npm run build
npm run preview
```

Instalación PWA:
- En navegadores compatibles aparecerá la opción para "Agregar a pantalla" o podrás usar el botón "Instalar aplicación" si aparece.

Instalación en iPhone (iOS)
- Recomendado: abrir la URL en Safari (no en otro navegador) para instalar en pantalla de inicio.
- Pasos rápidos:
	1. Abre `https://...` o `http://<TU_IP>:5173` en Safari en el iPhone.
	2. Pulsa el botón "Compartir" (cuadro con flecha) y elige "Añadir a pantalla de inicio".
	3. Pulsa "Añadir"; la app quedará como un icono en la pantalla de inicio y se abrirá en modo standalone.

Limitaciones y recomendaciones para iOS:
- Safari/iOS exige un contexto seguro (HTTPS) para que los service workers funcionen correctamente. Si pruebas usando la IP local (`http://192.168.x.x`) el service worker no se registrará en iOS. Para pruebas en dispositivo usa una URL HTTPS (ver abajo) o publica en hosting con HTTPS.
- Meta tags iOS: ya añadí `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` y `apple-touch-icon` en `index.html`.

Probar en tu iPhone desde tu dev server local (opciones):
- Opción rápida (ngrok): crea un túnel HTTPS a tu servidor dev y abre la URL de ngrok en Safari.

	```bash
	# instala o usa npx
	npx ngrok http 5173
	# ngrok te mostrará una URL https://xxxx.ngrok.io
	# abre esa URL en Safari en el iPhone
	```

- Opción pública: hacer deploy en Netlify/Vercel/GitHub Pages (todos proporcionan HTTPS automático). Ejemplo con Vercel:

	```bash
	npm i -g vercel
	vercel --prod
	```

Empaquetado nativo iOS (opcional — requiere macOS/Xcode):
- Si quieres una app nativa (.ipa) para la App Store puedes usar `Capacitor` o `Cordova`:

	1. `npm install @capacitor/cli @capacitor/core` y configurar el proyecto.
	2. `npx cap add ios` (necesitas macOS).
	3. Abrir el proyecto en Xcode (`npx cap open ios`) y generar la build firmada.

Nota: la generación de un `.ipa` firmado y la publicación en App Store requieren cuenta de desarrollador Apple y macOS/Xcode.

Archivos clave:
- [package.json](package.json)
- [index.html](index.html)
- [src/App.jsx](src/App.jsx)
- [public/manifest.json](public/manifest.json)
- [public/service-worker.js](public/service-worker.js)

Despliegue rápido
-----------------

Netlify (CLI):

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Vercel (CLI):

```bash
npm i -g vercel
vercel --prod
```

Nota: Los datos se guardan en `localStorage` por defecto o pueden provenir de `public/data.json`. Si despliegas la web, edita `public/data.json` antes del deploy para cambiar los valores iniciales.

Despliegue automático (GitHub Pages)
-----------------------------------

1. Crea un repositorio en GitHub y sube este proyecto (push a `main` o `master`).
2. El workflow en `.github/workflows/deploy-pages.yml` compilará y publicará la carpeta `dist` en GitHub Pages automáticamente.

Sincronización remota (opcional, Firebase)
------------------------------------------

Si querés que los datos se sincronicen entre varios celulares (en vez de solo `localStorage`), podés usar Firebase Realtime Database:

1. Crea un proyecto en https://console.firebase.google.com/ y habilita Realtime Database (modo pruebas o con reglas adecuadas).
2. Añade los secretos del proyecto en GitHub (Settings → Secrets) con estas claves: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`.
3. El workflow de GitHub Actions escribirá `public/firebase-config.json` usando esos secretos antes de compilar. La app detectará ese archivo y sincronizará `snt_data` con Firebase automáticamente.

Si querés que yo prepare y pruebe todo, lo siguiente que necesitás hacer es subir este repositorio a GitHub (yo no puedo subirlo por vos). Una vez que esté en GitHub, el deploy a Pages será automático en cada push a `main`.

Configuración rápida en este proyecto (sin GitHub)
-------------------------------------------------

1. Copia `public/firebase-config.example.json` a `public/firebase-config.json`.
2. Reemplaza los valores `TU_*` con los datos reales de tu proyecto Firebase.
3. Inicia la app (`npm run dev`) o genera build (`npm run build`).

Notas:
- `public/firebase-config.json` está ignorado en `.gitignore` para no subir credenciales.
- Si `public/firebase-config.json` está vacío (`{}`), la app funciona solo local sin nube.

Modo Offline + Sync Entre Dispositivos
-------------------------------------

Estado actual implementado:
- La app guarda siempre en `localStorage` (offline-first).
- Si hay `public/firebase-config.json` válido, sincroniza con Firebase Realtime Database.
- Si no hay internet, los cambios quedan en cola local y se intentan subir automáticamente al volver la conexión.
- Los datos usan metadatos de versión/fecha para elegir el más nuevo entre local y nube.

Qué necesitás para usarla en celular sin depender de esta PC:
1. Publicar la app con HTTPS (Netlify/Vercel/GitHub Pages).
2. Configurar Firebase (`public/firebase-config.json`) para que todos los dispositivos lean/escriban la misma nube.
3. Abrir la URL publicada desde cada celular/PC e instalar como PWA (Agregar a pantalla de inicio).

Comportamiento esperado:
- Cargas datos en celular sin señal: se guardan localmente.
- Cuando vuelve internet: la cola se sube a Firebase.
- Otro dispositivo que abra la app: descarga los datos más nuevos desde la nube.

Reglas Firebase Realtime (recomendado)
--------------------------------------

Para pruebas rápidas podés dejar modo prueba un tiempo corto, pero para producción conviene restringir la escritura.

Regla mínima recomendada para este proyecto (solo permite leer/escribir el nodo usado por la app):

```json
{
	"rules": {
		".read": false,
		".write": false,
		"snt_data": {
			".read": true,
			".write": true,
			".validate": "newData.hasChildren(['data'])"
		}
	}
}
```

Cómo aplicarla:
1. Firebase Console → Realtime Database → pestaña Reglas.
2. Reemplazá las reglas actuales por el bloque anterior.
3. Guardá/Publicá cambios.

Nota:
- Esta regla es útil para arrancar sin autenticación.
- Si luego querés máxima seguridad, el siguiente paso es habilitar Firebase Auth y cambiar reglas para que solo usuarios autenticados puedan escribir.
