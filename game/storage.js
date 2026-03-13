// IndexedDB storage for lap times
const DB_NAME = 'RacerLapTimes';
const DB_VERSION = 1;
const STORE_NAME = 'lapTimes';

let db = null;

async function initDB() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'trackName' });
                objectStore.createIndex('trackName', 'trackName', { unique: true });
            }
        };
    });
}

export async function saveLapTime(trackName, lapTime) {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const getRequest = store.get(trackName);
        
        getRequest.onsuccess = () => {
            let trackData = getRequest.result;
            
            if (!trackData) {
                trackData = {
                    trackName: trackName,
                    lapTimes: [],
                    bestTime: null
                };
            }
            
            // Add new lap time and keep only the 5 best
            trackData.lapTimes.push(lapTime);
            trackData.lapTimes.sort((a, b) => a - b);
            if (trackData.lapTimes.length > 5) {
                trackData.lapTimes = trackData.lapTimes.slice(0, 5);
            }
            
            // Update best time (use proper floating point comparison)
            if (trackData.bestTime === null || trackData.bestTime === undefined || lapTime < trackData.bestTime) {
                trackData.bestTime = lapTime;
            }
            
            const putRequest = store.put(trackData);
            putRequest.onsuccess = () => resolve(trackData);
            putRequest.onerror = () => reject(putRequest.error);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
    });
}

export async function hasAnyTrackData() {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            resolve(cursor !== null);
        };

        request.onerror = () => reject(request.error);
    });
}

export async function getTrackData(trackName) {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(trackName);
        
        request.onsuccess = () => {
            const result = request.result || {
                trackName: trackName,
                lapTimes: [],
                bestTime: null
            };
            resolve(result);
        };
        
        request.onerror = () => reject(request.error);
    });
}