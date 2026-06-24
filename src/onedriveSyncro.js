/**
 * onedriveSyncro.js
 * Sincroniza datos automáticamente con OneDrive
 */

const fs = require('fs').promises;
const path = require('path');

// Ruta de OneDrive en Windows
const ONEDRIVE_PATH = process.env.OneDriveConsumer || 
                      path.join(process.env.USERPROFILE || '', 'OneDrive');
const APP_FOLDER = path.join(ONEDRIVE_PATH, 'SOMOS NOCHE TRANSPORTE');
const DATA_FILE = path.join(APP_FOLDER, 'datos.json');

class OneDriveSync {
  constructor() {
    this.lastSync = null;
    this.localCache = null;
  }

  /**
   * Lee datos de OneDrive (o usa cache si no hay internet)
   */
  async readData() {
    try {
      // Intenta leer de OneDrive primero
      const content = await fs.readFile(DATA_FILE, 'utf-8');
      this.localCache = JSON.parse(content);
      this.lastSync = new Date();
      console.log('✅ Datos sincronizados desde OneDrive');
      return this.localCache;
    } catch (err) {
      if (this.localCache) {
        console.log('⚠️ Sin conexión a OneDrive. Usando datos en caché.');
        return this.localCache;
      }
      // Si no hay caché ni OneDrive, retorna datos vacíos
      console.error('❌ Error leyendo datos:', err.message);
      return { empresas: [], vehiculos: [], rutas: [] };
    }
  }

  /**
   * Escribe datos de vuelta a OneDrive
   */
  async writeData(data) {
    try {
      // Agregar timestamp
      data.ultima_actualizacion = new Date().toISOString();
      
      // Asegurar que la carpeta existe
      await fs.mkdir(APP_FOLDER, { recursive: true });
      
      // Escribir el archivo
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
      
      // Actualizar caché local
      this.localCache = data;
      this.lastSync = new Date();
      
      console.log('✅ Datos guardados en OneDrive');
      return true;
    } catch (err) {
      console.warn('⚠️ No se pudieron guardar datos en OneDrive:', err.message);
      // Guarda localmente aunque falle OneDrive
      this.localCache = data;
      return false;
    }
  }

  /**
   * Sincroniza cada X segundos si hay cambios
   */
  enableAutoSync(intervalMs = 30000) {
    setInterval(async () => {
      try {
        await this.readData();
      } catch (err) {
        console.log('Auto-sync revisión completada');
      }
    }, intervalMs);
  }

  /**
   * Obtiene ruta a OneDrive para debugging
   */
  getDataFilePath() {
    return DATA_FILE;
  }

  /**
   * Verifica si OneDrive está disponible
   */
  async isOneDriveAvailable() {
    try {
      await fs.access(APP_FOLDER);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new OneDriveSync();
